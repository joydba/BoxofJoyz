// Sends a WhatsApp message to the admin via Twilio.
// Fails silently (logs only) so a messaging outage never breaks signup/orders.

let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = require('twilio');
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function notifyAdminWhatsApp(message) {
  return sendWhatsApp(process.env.ADMIN_WHATSAPP_TO, message);
}

async function sendWhatsApp(to, message) {
  if (!client) {
    console.log('[WhatsApp notify skipped - Twilio not configured]', to, message);
    return;
  }
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
      body: message
    });
  } catch (err) {
    console.error(`WhatsApp notify failed for ${to}:`, err.message);
  }
}

// Sends the same message to a list of WhatsApp numbers (e.g. all users).
// Sends one at a time with a short delay to stay well under Twilio's rate limits.
async function broadcastWhatsApp(numbers, message) {
  for (const number of numbers) {
    await sendWhatsApp(number, message);
    await new Promise(r => setTimeout(r, 300));
  }
}

module.exports = { notifyAdminWhatsApp, sendWhatsApp, broadcastWhatsApp };
