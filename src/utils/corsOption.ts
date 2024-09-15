import { Request, Response, NextFunction } from "express";

export const corsOption =  (req: Request, res: Response, next: NextFunction) => {

  res.setHeader("Access-Control-Allow-Origin", 'http://localhost:3000');
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",  "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Credentials", 'true')

  next();
};

export default corsOption