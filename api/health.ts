import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { appRouter } = await import("../server/routers");
    res.status(200).json({ 
      status: "alive", 
      time: new Date().toISOString(),
      brain_loaded: !!appRouter 
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: "brain_crash",
      error: error.message,
      stack: error.stack
    });
  }
}
