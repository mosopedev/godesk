import IController from "interfaces/controller.interface";
import { Router, Request, Response, NextFunction } from "express";
import * as validation from './user.validation'
import successResponse from "@/utils/success";
import HttpException from '../../exceptions/http.exception';

// import s3Upload from "@/configs/s3.config";

import authenticatedMiddleware from "@/middlewares/authenticate.middleware";
import validationMiddleware from "@/middlewares/validation.middleware";
import userModel from "./user.model";
import UserService from "./user.service";

class UserController implements IController {
    public path = '/user'
    public router = Router()
    private userService = new UserService()

    constructor() {
        this.initializeRoutes()
    }

    private initializeRoutes(): void {
        this.router.post(`${this.path}/onboard`, authenticatedMiddleware, this.onboardUser)
        this.router.get(`${this.path}/profile`, authenticatedMiddleware, this.getUserInfo)
    }

    private onboardUser = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {

            const photo = req.files.find(((obj: { fieldname: string; }) => obj.fieldname == 'photo'))
            const resume = req.files.find(((obj: { fieldname: string; }) => obj.fieldname == 'resume'))

            const { bio, countryCode, yearsOfExperience, stateOrProvince, country } = req.body;

            console.log(bio, countryCode, yearsOfExperience, stateOrProvince)

            const response = await this.userService.onboard(
                req.user,
                bio,
                countryCode,
                yearsOfExperience,
                stateOrProvince,
                country,
                {
                    fileName: photo?.originalname,
                    key: photo?.key,
                    url: photo?.location,
                    etag: photo?.etag
                },
                {
                    fileName: resume?.originalname,
                    key: resume?.key,
                    url: resume?.location,
                    etag: resume?.etag
                }
            )

            successResponse(200, 'Profile updated successfully', res)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private getUserInfo = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = await this.userService.getUserInfo(req.user)

            successResponse(200, 'Profile retrieved successfully', res, user)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

}

export default UserController