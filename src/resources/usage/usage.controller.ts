import { Request, Response, NextFunction } from "express";
import { Router } from "express";
import IController from "interfaces/controller.interface";
import successResponse from "@/utils/success";
import HttpException from "../../exceptions/http.exception";
import logger from "@/utils/logger";
import authenticatedMiddleware from "@/middlewares/authenticate.middleware";
import UsageService from "./usage.service";

class UsageController implements IController {
    public path = '/usage'
    public router = Router()
    private usageService = new UsageService()

    constructor() {
        this.initializeRoutes()
    }

    private initializeRoutes(): void {
        this.router.get(`${this.path}/business/:businessId/calls`, authenticatedMiddleware, this.getBusinessCallLog)
    }

    private getBusinessCallLog = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { businessId } = req.params;

            if(!businessId) throw new Error("Invalid request. Provide business ID.")

            const response = await this.usageService.getBusinessCallUsage(businessId)

            successResponse(200, 'Business call log retrieved', res, response);
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }
}

export default UsageController