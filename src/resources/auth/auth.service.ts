import translateError from "@/utils/mongod.helper";
import userModel from "../user/user.model";
import IUser from "../user/user.interface";
import * as token from "@/utils/token";
import { ObjectId } from "mongoose";
import logger from "@/utils/logger";
import authModel from "./auth.model";
import IAuth from "./auth.interface";
import sendMail from "@/utils/zepto";
import bcrypt from "bcrypt";
import generateOtp from "@/utils/otp";
import moment from "moment";
import Stripe from "stripe";
import IBusiness from "../business/business.interface";
import businessModel from "../business/business.model";

class AuthService {
  private readonly stripe = new Stripe(`${process.env.STRIPE_SECRET_KEY}`);
  public async signup(
    firstname: string,
    password: string,
    email: string,
    lastname: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      if (!(await this.validatePasswordPolicy(password)))
        throw new Error(
          "Password is not secure. Include at least one uppercase, lowercase, special character and number."
        );

      const otp = generateOtp(5);

      const customer = await this.stripe.customers.create({
        name: `${firstname} ${lastname}`,
        email,
      });

      if (!customer)
        throw new Error("Unable to create your account. Please try again.");

      logger(customer);

      const user = await userModel.create({
        firstname,
        lastname,
        email: email.toLowerCase(),
        password,
        emailVerificationToken: {
          token: otp,
          expires: moment(new Date()).add(5, "m").toDate(),
        },
        stripeCustomer: customer,
      });

      if (!user)
        throw new Error("Unable to create your account. Please try again.");

      const accessToken = await token.generateToken(user.id, true);
      const refreshToken = await token.generateToken(user.id, false);

      // log session
      const authSession: IAuth = await authModel.create({
        userId: user.id,
        refreshToken: refreshToken,
      });

      await sendMail(
        "chimecall-wel-mail",
        {
          email,
          name: `${firstname} ${lastname}`,
        },
        "Welcome to Go Desk ☎️",
        {
          name: `${firstname} ${lastname}`,
          product_name: "Go Desk",
          verification_code: otp,
        }
      );

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger(error);
      throw new Error(
        translateError(error)[0] ||
          "Unable to create your account. Please try again."
      );
    }
  }

  public async login(
    email: string,
    password: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      firstname: string;
      lastname: string;
      email: string;
      photo?: string;
      isEmailVerified: boolean;
    };
    business: IBusiness | null
  }> {
    try {
      const user: IUser | null = await userModel.findOne({
        email: email.toLowerCase(),
      });

      if (!user) throw new Error("Incorrect email or password");

      const business = await businessModel.findOne(
        {
          admin: user.id
        }
      ).select("_id")

      const { firstname, lastname, isEmailVerified } = user;

      if (!(await user.isValidPassword(password)))
        throw new Error("Incorrect email or password");

      await authModel.deleteOne({ userId: user.id });

      const accessToken = await token.generateToken(user.id, true);
      const refreshToken = await token.generateToken(user.id, false);

      const authSession: IAuth = await authModel.create({
        userId: user.id,
        refreshToken: refreshToken,
      });
      logger(authSession);

      return {
        accessToken,
        refreshToken,
        user: {
          firstname,
          lastname,
          email,
          isEmailVerified,
        },
        business,
      };
    } catch (error: any) {
      logger(error);
      throw new Error(
        translateError(error)[0] || "Incorrect email or password."
      );
    }
  }

  public async resendEmailVerificationCode(email: string): Promise<void> {
    try {
      const otp = generateOtp(5);

      const user = await userModel.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
          emailVerificationToken: {
            token: otp,
            expires: moment(new Date()).add(5, "m").toDate(),
          },
        },
        { new: true }
      );

      if (!user) throw new Error("User not found.");

      const { firstname, lastname } = user;

      await sendMail(
        "chimecall-wel-mail",
        {
          email,
          name: `${firstname} ${lastname}`,
        },
        "Welcome to Go Desk ☎️",
        {
          name: `${firstname} ${lastname}`,
          product_name: "Go Desk",
          verification_code: otp,
        }
      );
    } catch (error: any) {
      throw new Error(
        error || "Unable to send verification code. Please try again."
      );
    }
  }

  private async validatePasswordPolicy(password: string): Promise<Boolean> {
    try {
      const REQUIRED_CHARACTER_CLASSES = 4;

      const characterClasses: Record<string, RegExp> = {
        uppercase: /[A-Z]/,
        lowercase: /[a-z]/,
        digit: /\d/,
        special: /[^\w\s]/,
      };

      let count = 0;

      for (const [name, regex] of Object.entries(characterClasses)) {
        if (regex.test(password)) {
          count += 1;
        }
      }

      if (count < REQUIRED_CHARACTER_CLASSES) {
        return false;
      }

      return true;
    } catch (error) {
      throw new Error(
        translateError(error)[0] || "Unable to validate password security"
      );
    }
  }

  public async verifyEmail(formToken: string, email: string): Promise<void> {
    try {
      const user: IUser | null = await userModel.findOne({ email });

      if (!user) throw new Error("Unable to verify email. Account not found");

      const { token, expires } = user.emailVerificationToken;

      if (Date.now() > new Date(expires).getTime() || token != formToken)
        throw new Error("Invalid or expired token.");

      const updatedUser = await userModel.findOneAndUpdate(
        { email },
        {
          isEmailVerified: true,
        }
      );

      if (!updatedUser)
        throw new Error("Unable to verify email. Please try again.");
    } catch (error: any) {
      throw new Error(error || "Unable to verify email. Please try again.");
    }
  }

}

export default AuthService;
