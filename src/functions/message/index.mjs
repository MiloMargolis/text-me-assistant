import OpenAI from 'openai';
import twilio from 'twilio';
import { QA_TEXT } from './qa.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

export const handler = async (event) => {
  try {
    // Log the full event in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Event:', JSON.stringify(event, null, 2));
    }

    // Parse the incoming webhook body
    const body = event.body ? 
      (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) 
      : {};

    const messageBody = body.Body || '';
    const fromNumber = body.From || '';

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: QA_TEXT
        },
        {
          role: "user",
          content: messageBody
        }
      ],
      max_tokens: 160,
      temperature: 0.5
    });

    const aiResponse = completion.choices[0].message.content.trim();
    
    // If the response is the escalation message, handle escalation
    if (aiResponse === "Let me forward this to a manager.") {
      // Log escalation for development
      console.log('ESCALATION NEEDED:', {
        from: fromNumber,
        message: messageBody,
        timestamp: new Date().toISOString()
      });
      
      // In development, just return the escalation message
      return createTwiMLResponse("Let me forward this to a manager.");
    }
    
    return createTwiMLResponse(aiResponse);

  } catch (error) {
    console.error('Error:', error);
    return createTwiMLResponse("Sorry, I couldn't process your message. Please try again.", 500);
  }
};