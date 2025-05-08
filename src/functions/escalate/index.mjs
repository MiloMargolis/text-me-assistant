import twilio from 'twilio';

// Mock Twilio client for development
const mockTwilioClient = {
  validateRequest: () => true,
  messages: {
    create: async ({ body, to, from }) => {
      console.log('Mock Twilio SMS:', {
        body,
        to,
        from,
        timestamp: new Date().toISOString()
      });
      return { sid: 'mock_message_sid' };
    }
  }
};

// Initialize Twilio client based on environment
const twilioClient = process.env.NODE_ENV === 'development' 
  ? mockTwilioClient 
  : twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Helper function to create TwiML response
function createTwiMLResponse(message, statusCode = 200) {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${message}</Message>
    </Response>`;

  return {
    statusCode,
    body: twimlResponse,
    headers: {
      'Content-Type': 'application/xml'
    }
  };
}

// Helper function to send SMS via Twilio
async function sendSMS(to, body) {
  try {
    await twilioClient.messages.create({
      body,
      to,
      from: process.env.TWILIO_PHONE_NUMBER
    });
    console.log(`SMS sent to ${to}`);
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
} 

// Helper function to validate request payload
function validatePayload(body) {
  if (!body.original_message || !body.from_number) {
    throw new Error('Missing required fields: original_message and from_number are required');
  }
  
  // Validate phone number format (basic validation)
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  if (!phoneRegex.test(body.from_number)) {
    throw new Error('Invalid phone number format');
  }
  
  // Validate importance score if provided
  if (body.importance_score !== undefined) {
    const score = parseFloat(body.importance_score);
    if (isNaN(score) || score < 0 || score > 1) {
      throw new Error('Importance score must be a number between 0 and 1');
    }
  }
}

// Helper function to format escalation message
function formatEscalationMessage(originalMessage, fromNumber, importanceScore) {
  const scoreText = importanceScore ? ` (Importance: ${Math.round(importanceScore * 100)}%)` : '';
  return `🚨 ESCALATION ALERT${scoreText}\n\nFrom: ${fromNumber}\nMessage: ${originalMessage}`;
}

export const handler = async (event) => {
  try {
    // Parse request body
    const body = event.body ? 
      (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) 
      : {};

    // Validate payload
    validatePayload(body);

    // Format the escalation message
    const escalationMessage = formatEscalationMessage(
      body.original_message,
      body.from_number,
      body.importance_score
    );

    // Send SMS to manager using mock client
    const result = await twilioClient.messages.create({
      body: escalationMessage,
      to: process.env.MANAGER_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });
    console.log('Mocked message response:', result);

    // Log successful escalation
    console.log('Escalation sent successfully', {
      fromNumber: body.from_number,
      importanceScore: body.importance_score,
      timestamp: new Date().toISOString()
    });

    return createTwiMLResponse('Escalation sent successfully');

  } catch (error) {
    console.error('Escalation error:', error);
    return createTwiMLResponse(error.message || 'Internal server error', error.message.includes('Missing required fields') ? 400 : 500);
  }
}; 