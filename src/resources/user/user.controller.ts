import IController from "interfaces/controller.interface";
import { Router, Request, Response, NextFunction } from "express";
import successResponse from "@/utils/success";
import HttpException from '../../exceptions/http.exception';
import authenticatedMiddleware from "@/middlewares/authenticate.middleware";
import UserService from "./user.service";

class UserController implements IController {
    public path = '/user'
    public router = Router()
    private userService = new UserService()

    constructor() {
        this.initializeRoutes()
    }

    private initializeRoutes(): void {
        this.router.get(`${this.path}`, authenticatedMiddleware, this.getUserInfo)
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