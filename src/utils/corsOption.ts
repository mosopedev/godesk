import { Request, Response, NextFunction } from "express";

export const corsOption =  (req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = ["https://godesk-frontend.vercel.app", "https://localhost:3000"];
  const origin = req.headers.origin as string;

  if(allowedOrigins.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",  "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Credentials", 'true')

  next();
};

export default corsOption