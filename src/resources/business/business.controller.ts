import { Request, Response, NextFunction } from "express";
import { Router } from "express";
import IController from "interfaces/controller.interface";
import IUser from "../user/user.interface";
import successResponse from "@/utils/success";
import HttpException from "../../exceptions/http.exception";
import * as validation from './business.validation'
import validationMiddleware from "@/middlewares/validation.middleware";
import logger from "@/utils/logger";
import authenticatedMiddleware from "@/middlewares/authenticate.middleware";
import BusinessService from "./business.service";
import { upload } from '@/configs/multer'

class BusinessController implements IController {
    public path = '/business'
    public router = Router()
    private businessService = new BusinessService()

    constructor() {
        this.initializeRoutes()
    }

    private initializeRoutes(): void {
        this.router.post(`${this.path}/create`, validationMiddleware(validation.createBusiness), authenticatedMiddleware, this.createBusiness)
        this.router.get(`${this.path}/:businessId`, authenticatedMiddleware, this.getBusiness)
        this.router.post(`${this.path}/knowledge-base`, upload.single('file'), authenticatedMiddleware, this.parseKnowledgeBase)
        this.router.get(`${this.path}/:businessId/:agentId`, authenticatedMiddleware, this.getBusinessAndAgent)
    }

    private createBusiness = async (req: Request | any, res: Response, next: NextFunction): Promise<IUser | void> => {
        try {
            const response = await this.businessService.createBusiness(req.body, req.user)
            logger(response)
            successResponse(201, 'Business created successful', res, response)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private getBusiness = async (req: Request | any, res: Response, next: NextFunction): Promise<IUser | void> => {
        try {
            const { businessId } = req.params;

            if (!businessId) throw new Error("Invalid business Id")

            const response = await this.businessService.getBusiness(businessId)

            logger(response)

            successResponse(200, 'Business retrieved successful', res, response)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private getBusinessAndAgent = async (req: Request | any, res: Response, next: NextFunction): Promise<IUser | void> => {
        try {
            const { businessId, agentId } = req.params;

            if (!businessId || !agentId) throw new Error("Invalid business or agent Id")

            const response = await this.businessService.getBusinessAndAgent(businessId, agentId)

            logger(response)

            successResponse(200, 'Business retrieved successful', res, response)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private parseKnowledgeBase = async (req: Request | any, res: Response, next: NextFunction): Promise<IUser | void> => {
        try {
            if (!req.file) {
                throw new Error('No file uploaded.');
            }

            const pdfParser = require('pdf-parse')
            const pdfData = await pdfParser(req.file.buffer);

            logger(pdfData.text)

            await this.businessService.parseKnowledgeBase(pdfData.text, req.body.businessId)

            successResponse(200, 'Knowledge base parsed successful', res)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }
}

export default BusinessController