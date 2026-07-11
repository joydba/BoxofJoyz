// Sends a WhatsApp message to the admin via Twilio.
// Fails silently (logs only) so a messaging outage never breaks signup/orders.

let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = require('twilio');
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function notifyAdminWhatsApp(message) {
  if (!client) {
    console.log('[WhatsApp notify skipped - Twilio not configured]', message);
    return;
  }
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM, // e.g. 'whatsapp:+14155238886' (Twilio sandbox number)
      to: process.env.ADMIN_WHATSAPP_TO,       // e.g. 'whatsapp:+919591611667'
      body: message
    });
  } catch (err) {
    console.error('WhatsApp notify failed:', err.message);
  }
}

module.exports = { notifyAdminWhatsApp };
