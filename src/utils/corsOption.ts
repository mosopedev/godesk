// options for cors
import { Request, Response, NextFunction } from "express";
import logger from "./logger";

export const corsOption =  (req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = ["*"];
  const origin = req.headers.origin as string;

  res.setHeader("Access-Control-Allow-Origin", '*');
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",  "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");

  next();
};

export default corsOption