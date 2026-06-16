import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import cors from 'cors';
import twilio from 'twilio';

admin.initializeApp();
const db = admin.firestore();
const allowCors = cors({ origin: true });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });

async function getUidFromAuthHeader(req: any) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new Error('Missing auth token');
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

export const createCheckoutSession = onRequest((req, res) => allowCors(req, res, async () => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const uid = await getUidFromAuthHeader(req);
    const { plan, priceId } = req.body;
    if (!['starter', 'business', 'premium'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });

    const ownerRef = db.collection('owners').doc(uid);
    const ownerSnap = await ownerRef.get();
    const owner = ownerSnap.data();
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    let customerId = owner.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: owner.email, name: owner.fullName, metadata: { ownerId: uid } });
      customerId = customer.id;
      await ownerRef.update({ stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'minishop://dashboard/billing?success=true',
      cancel_url: 'minishop://pricing?cancel=true',
      metadata: { ownerId: uid, plan }
    });
    return res.json({ url: session.url });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}));

export const createCustomerPortal = onRequest((req, res) => allowCors(req, res, async () => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const uid = await getUidFromAuthHeader(req);
    const owner = (await db.collection('owners').doc(uid).get()).data();
    if (!owner?.stripeCustomerId) return res.status(400).json({ error: 'No Stripe customer found.' });
    const session = await stripe.billingPortal.sessions.create({ customer: owner.stripeCustomerId, return_url: 'minishop://dashboard/billing' });
    return res.json({ url: session.url });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}));

export const stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody, sig as string, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const ownerId = session.metadata?.ownerId;
    const plan = session.metadata?.plan;
    if (ownerId) await db.collection('owners').doc(ownerId).update({ plan, subscriptionStatus: 'active', stripeSubscriptionId: session.subscription, updatedAt: Date.now() });
  }

  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object as Stripe.Subscription;
    const ownerSnap = await db.collection('owners').where('stripeCustomerId', '==', sub.customer).limit(1).get();
    if (!ownerSnap.empty) {
      const ownerRef = ownerSnap.docs[0].ref;
      await ownerRef.update({ subscriptionStatus: sub.status, stripeSubscriptionId: sub.id, updatedAt: Date.now() });
    }
  }
  res.json({ received: true });
});

function buildOrderMessage(order: any) {
  const lines = order.items.map((i: any, idx: number) => `${idx + 1}. ${i.name} — Qty: ${i.quantity} — $${i.price}`).join('\n');
  return `New order received on MiniShop.\n\nShop: ${order.shopName}\nCustomer: ${order.customerName}\nPhone: ${order.customerPhone}\nDelivery: ${order.deliveryAddress}\n\nOrder Details:\n${lines}\n\nEstimated Total: $${order.estimatedTotal}\nNotes: ${order.notes || 'None'}\n\nPlease log in to your MiniShop app to process this order.`;
}

export const sendNewOrderNotification = onRequest((req, res) => allowCors(req, res, async () => {
  try {
    const { orderId } = req.body;
    const orderSnap = await db.collection('orders').doc(orderId).get();
    const order = orderSnap.data();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const owner = (await db.collection('owners').doc(order.ownerId).get()).data();
    if (!owner?.whatsapp) return res.json({ ok: true, skipped: 'No owner WhatsApp number.' });

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${owner.whatsapp}`,
      body: buildOrderMessage(order)
    });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}));

export const sendOrderStatusNotification = onRequest((req, res) => allowCors(req, res, async () => {
  try {
    const { orderId, status } = req.body;
    const orderSnap = await db.collection('orders').doc(orderId).get();
    const order = orderSnap.data();
    if (!order?.customerWhatsapp) return res.json({ ok: true, skipped: 'No customer WhatsApp number.' });
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${order.customerWhatsapp}`,
      body: `Hello ${order.customerName}, your order from ${order.shopName} is now: ${String(status).replace(/_/g, ' ')}.`
    });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}));
