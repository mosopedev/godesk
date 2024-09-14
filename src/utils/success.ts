import { Request, Response, NextFunction } from "express"

function successResponse(
    statusCode: number,
    message: string,
    res: Response,
    data?: any,
):void {
  const response: {
    success: boolean;
    message: string;
    data?: any
  } = {
    success: true,
    message,
  }

  if(data) response.data = data

    res.status(statusCode).json(response);
}
export default successResponse