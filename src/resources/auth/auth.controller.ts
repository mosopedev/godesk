import { Request, Response, NextFunction } from "express";
import { Router } from "express";
import IController from "interfaces/controller.interface";
import IUser from "../user/user.interface";
import AuthService from './auth.service'
import * as validation from './auth.validation' 
import successResponse from "@/utils/success";
import HttpException from "../../exceptions/http.exception";
import validationMiddleware from "@/middlewares/validation.middleware";
import logger from "@/utils/logger";
import authenticatedMiddleware from "@/middlewares/authenticate.middleware";
import UserService from "../user/user.service";

class AuthController implements IController{
    public path = '/auth'
    public router = Router()
    private authService = new AuthService()

    constructor() {
        this.initializeRoutes()
    }

    private initializeRoutes(): void {
        this.router.post(`${this.path}/signup`, validationMiddleware(validation.signup), this.signup)
        this.router.post(`${this.path}/login`, validationMiddleware(validation.login), this.login)
        this.router.post(`${this.path}/verify-account`, validationMiddleware(validation.verifyEmail), authenticatedMiddleware, this.verifyEmail)
        this.router.post(`${this.path}/forgot-password`, validationMiddleware(validation.forgotPassword), this.forgotPassword)
        this.router.post(`${this.path}/reset-password`, validationMiddleware(validation.resetPassword), this.resetPassword)
        this.router.post(`${this.path}/resend-verification`, this.resendVerificationCode)
    }

    private signup = async (req: Request, res: Response, next: NextFunction): Promise<IUser | void> => {
        try {
            const { firstname, lastname, email, password } = req.body

            const tokens = await this.authService.signup(firstname, password, email, lastname)

            res.header('Authorization', tokens.accessToken)
            res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, sameSite: 'strict' })

            successResponse(201, 'Signup successful', res, tokens)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email, password } = req.body;
        
            const response = await this.authService.login(email, password)

            res.header('Authorization', response.accessToken)
            res.cookie('refreshToken', response.refreshToken, { httpOnly: true, sameSite: 'strict' })

            successResponse(200, 'Login successful', res, response)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private verifyEmail = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { token, email } = req.body;

            await this.authService.verifyEmail(token, email)

            successResponse(200, 'Account verified successfully.', res)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private forgotPassword = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email } = req.body;

            await this.authService.forgotPassword(email)

            successResponse(200, 'Forgot password mail sent.', res)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    } 

    private resetPassword = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email, token, password } = req.body;

            await this.authService.resetPassword(email, token, password)

            successResponse(200, 'Password reset successfully', res)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }

    private resendVerificationCode = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.resendEmailVerificationCode(req.body.email)

            successResponse(200, 'Email sent successfully', res)
        } catch (error: any) {
            return next(new HttpException(400, error.message));
        }
    }
}

export default AuthController