import translateError from "@/utils/mongod.helper";
import userModel from "../user/user.model";
import IUser from "../user/user.interface";
import * as token from "@/utils/token";
import logger from "@/utils/logger";
import businessModel from "./business.model";
import IBusiness from "./business.interface";
import bcrypt from "bcrypt";
import generateOtp from "@/utils/otp";
import moment from "moment";
import twilio from "twilio";
import { v4 as uuid } from "uuid";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import agentModel from "../agent/agent.model";

class BusinessService {
  private readonly twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  public async createBusiness(data: IBusiness, userId: string) {
    try {
      const { name, email, website, country, humanOperatorPhoneNumbers } = data;
      const uniqueName = `${name}~${randomUUID()}`;

      // const businessAccount = await this.twilioClient.api.accounts.create({
      //     friendlyName: uniqueName,
      // });

      // const twilioAccount = {
      //     sid: businessAccount.sid,
      //     dateCreated: businessAccount.dateCreated,
      //     dateUpdated: businessAccount.dateUpdated,
      //     status: businessAccount.status,
      //     authToken: businessAccount.authToken,
      // };

      // logger(businessAccount);

      const business = await businessModel.create({
        name,
        uniqueName,
        email,
        website,
        country,
        admin: userId,
        humanOperatorPhoneNumbers,
        // twilioAccount,
      });

      if (!business)
        throw new Error("Failed to create business. Please try again.");

      return business;
    } catch (error: any) {
      throw new Error(error || "Failed to create business. Please try again.");
    }
  }

  public async getBusiness(id: string): Promise<IBusiness | undefined> {
    try {
      const business: IBusiness | null = await businessModel
        .findById(id)
        .select(
          "name uniqueName website humanOperatorPhoneNumbers email country"
        );

      if (!business) throw new Error("Business not found.");

      return business;
    } catch (error: any) {
      throw new Error(
        error || "Failed to retrieve business. Please try again."
      );
    }
  }

  public async getBusinessAndAgent(
    id: string,
    agentId: string
  ): Promise<IBusiness | undefined> {
    try {
      const businessInfo = await agentModel.aggregate([
        {
          $match: {
            _id: new ObjectId(agentId),
          },
        },
        {
          $lookup: {
            from: "Businesses",
            localField: "businessId",
            foreignField: "_id",
            as: "businessDetails",
          },
        },
        {
          $project: {
            "businessDetails.parsedKnowledgeBase": 0,
          },
        },
      ]);

      console.log(businessInfo);

      if (!businessInfo) throw new Error("Business not found.");

      return businessInfo[0];
    } catch (error: any) {
      throw new Error(
        error || "Failed to retrieve business. Please try again."
      );
    }
  }

  public async getBusinessKnowledgeBase(
    id: string
  ): Promise<IBusiness | undefined> {
    try {
      const business: IBusiness | null = await businessModel
        .findById(id)
        .select("parsedKnowledgeBase");

      if (!business) throw new Error("Business not found.");

      return business;
    } catch (error: any) {
      throw new Error(
        error || "Failed to retrieve business. Please try again."
      );
    }
  }

  public async parseKnowledgeBase(parsedContent: string, businessId: string) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const updatedBusiness = await businessModel.findByIdAndUpdate(
        businessId,
        {
          parsedKnowledgeBase: parsedContent,
        }
      );

      if (!updatedBusiness)
        throw new Error("Failed to upload knowledge base, please try again.");
    } catch (error: any) {
      throw new Error(
        error || "Unable to upload knowledge base. Please try again."
      );
    }
  }
}

export default BusinessService;
