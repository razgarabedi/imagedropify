import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// SECURITY NOTE:
// API keys for AI services (like Google AI) should be managed securely.
// - Do NOT hardcode API keys in your source code.
// - Use environment variables (e.g., GOOGLE_API_KEY for Google AI).
// - For local development, you can use a .env.local file (ensure it's in .gitignore).
// - In production, configure environment variables through your hosting provider's interface or deployment system.
// The googleAI() plugin typically picks up the GOOGLE_API_KEY from the environment automatically.

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash',
});
