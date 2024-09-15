import businessModel from "../business/business.model";
import IUsage from "./usage.interface";
import twilio from "twilio";
import { ObjectId } from "mongodb";
import OpenAI from "openai";
import usageModel from "./usage.model";
import logger from "@/utils/logger";

class UsageService {
  public async getTotalBusinessUsage(businessId: string) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const subTwilioClient = twilio(
          business.twilioAccount.sid,
          business.twilioAccount.authToken
      );

      const calls = await subTwilioClient.calls.list();
      logger(calls[0]);

      let totalCallUsage = 0;
      calls.forEach((call) => {
        // convert dollar unit to cents
        totalCallUsage += Number(call.price) * 100;
      });

      if (!calls)
        throw new Error("Unable to retrieve total usage");

      return totalCallUsage;
    } catch (error: any) {
      throw new Error(error.message || "Unable to retrieve total usage.");
    }
  }

  public async getBusinessCallUsage(businessId: string) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const subTwilioClient = twilio(
        business.twilioAccount.sid,
        business.twilioAccount.authToken
      );

      const calls = await subTwilioClient.calls.list();

      return calls;
    } catch (error: any) {
      throw new Error(error.message || "Unable to retrieve call usage.");
    }
  }
}

export default UsageService;
