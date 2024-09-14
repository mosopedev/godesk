import { ObjectId } from "mongoose";

interface IUser {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
    id: string;
    isEmailVerified: boolean;
    phoneNumber: number;
    emailVerificationToken: {
        token: string,
        expires: Date
    };
    resetPasswordToken: {
        token: string,
        expires: Date
    };
    stripeCustomer: {
        id: string
    }
    
    isValidPassword(password: string): Promise<Error | boolean>; 
}

export default IUser