import translateError from "@/utils/mongod.helper";
import userModel from "../user/user.model";
import logger from "@/utils/logger";
import businessModel from "../business/business.model";
import BusinessService from "../business/business.service";
import twilio from "twilio";
import OpenAI from "openai";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import IAgentResponse from "@/interfaces/agent.response.interface";
import axios from "axios";
import UsageService from "../usage/usage.service";
import agentModel from "./agent.model";
import { ObjectId } from "mongodb";
import IAgent from "./agent.interface";
import crypto from "crypto";

class AgentService {
  private readonly openAiClient = new OpenAI({
    organization: process.env.OPENAI_ORG_ID,
    project: process.env.OPENAI_PROJECT_ID,
    apiKey: process.env.OPENAI_SECRET_KEY,
  });
  private readonly twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  private readonly businessService = new BusinessService();
  private readonly usageService = new UsageService();

  public async createAgent(
    agentName: string,
    agentType: string,
    agentPrimaryLanguage: string,
    businessId: string
  ) {
    try {
      const agentApiKey = `agnt_${crypto.randomBytes(32).toString("hex")}`;
      const agent = agentModel.create({
        agentName,
        agentType,
        agentPrimaryLanguage,
        businessId,
        agentApiKey,
        agentApiKeySample: agentApiKey.slice(0, 15),
      });

      if (!agent) throw new Error("Unable to create agent. Please try again.");

      return { agent, agentApiKey };
    } catch (error: any) {
      throw new Error(error || "Unable to create agent. Please try again.");
    }
  }

  public async getAgentById(agentId: string) {
    try {
      const agent = await agentModel.findById(agentId).select("agentApiKey");

      if (!agent) throw new Error("Agent not found.");

      return agent;
    } catch (error: any) {
      throw new Error(error || "Unable to retrieve agent. Please try again.");
    }
  }

  public async acceptCall(twiml: VoiceResponse, agentPhoneNumber: string) {
    try {
      const agentAndBusiness = await agentModel.aggregate([
        {
          $match: {
            agentPhoneNumbers: {
              $elemMatch: {
                phoneNumber: agentPhoneNumber,
              },
            },
          },
        },
        {
          $lookup: {
            from: "Businesses",
            localField: "businessId",
            foreignField: "_id",
            as: "business",
          },
        },
        {
          $project: {
            "business._id": 1,
            _id: 1,
          },
        },
      ]);

      logger(agentAndBusiness);
      const thread = await this.openAiClient.beta.threads.create();

      logger(thread);

      twiml.say("Hello, how can i be of service today ?");

      twiml.gather({
        action: `/agent/call/analyze?bus_id=${agentAndBusiness[0].business._id}&th_id=${thread.id}&ass_id=${process.env.ASSISTANT_ID}&agnt_id=${agentAndBusiness[0]._id}`,
        input: ["speech"],
        speechTimeout: "2",
        method: "post",
        speechModel: "experimental_conversations",
        // actionOnEmptyResult: true
      });

      return twiml;
    } catch (error: any) {
      logger(error);
      twiml.say("Sorry an error has occurred, Please try again later");
      twiml.hangup();

      throw new Error(error || "an error has occurred, Please try again later");
    }
  }

  public async analyzeIntent(
    twiml: VoiceResponse,
    th_id: string,
    bus_id: string,
    ass_id: string,
    agnt_id: string,
    speechResult: string,
    actionResult?: string
  ) {
    try {
      await this.openAiClient.beta.threads.messages.create(th_id, {
        role: "user",
        content: JSON.stringify({
          businessId: bus_id,
          agentId: agnt_id,
          customerInput: speechResult,
          actionResult,
        }),
      });

      let runObject = await this.openAiClient.beta.threads.runs.createAndPoll(
        th_id,
        {
          assistant_id: ass_id,
        }
      );

      logger("run object in analyzer", runObject);

      const toolCalls =
        runObject.required_action?.submit_tool_outputs.tool_calls;

      if (toolCalls) {
        const functionCallOutputs: any = await Promise.all(
          toolCalls.map(async (toolCall) => {
            // logger(toolCall);
            logger("Function called: ", toolCall.function.name);
            logger("Function args ", toolCall.function.arguments);

            const args = JSON.parse(toolCall.function.arguments);

            if (toolCall.function.name == "getBusiness") {
              return {
                output: JSON.stringify(
                  await this.businessService.getBusinessAndAgent(
                    args.id,
                    args.agentId
                  )
                ),
                tool_call_id: toolCall.id,
              };
            } else if (toolCall.function.name == "getBusinessKnowledgeBase") {
              return {
                output: JSON.stringify(
                  await this.businessService.getBusinessKnowledgeBase(args.id)
                ),
                tool_call_id: toolCall.id,
              };
            }
          })
        );

        runObject =
          await this.openAiClient.beta.threads.runs.submitToolOutputsAndPoll(
            th_id,
            runObject.id,
            { tool_outputs: functionCallOutputs }
          );
      }

      // logger(runObject)
      while (true) {
        if (runObject.completed_at != null) {
          const message = (
            await this.openAiClient.beta.threads.messages.list(th_id)
          ).data;

          let lastMessage = message[0].content[0];
          let messageText: any;

          if (lastMessage.type == "text") {
            messageText = lastMessage.text.value
              .replace(/```json|```/g, "")
              .trim();
          }

          const agentResponse = JSON.parse(messageText);

          await this.actionHandler(
            agentResponse,
            twiml,
            th_id,
            bus_id,
            ass_id,
            agnt_id
          );

          if (runObject.usage)
            this.usageService.addTokenUsage(
              runObject.usage,
              bus_id,
              th_id,
              agnt_id
            );

          break;
        }
      }

      return twiml;
    } catch (error: any) {
      logger(error);
      twiml.say("Sorry, an error has occurred. Please try again later.");
      twiml.hangup();

      throw new Error(
        error.message || "An error has occurred. Please try again later."
      );
    }
  }

  private async actionHandler(
    agentResponse: IAgentResponse,
    twiml: VoiceResponse,
    th_id: string,
    bus_id: string,
    ass_id: string,
    agnt_id: string
  ) {
    try {
      logger(agentResponse);

      if (
        (agentResponse.action == null &&
          agentResponse.isActionConfirmation == false) ||
        (agentResponse.action != null &&
          agentResponse.isActionConfirmation == true) ||
        (agentResponse.action == null &&
          agentResponse.isActionConfirmation == true)
      ) {
        twiml.say(agentResponse.responseMessage);

        twiml.gather({
          action: `/agent/call/analyze?bus_id=${bus_id}&th_id=${th_id}&ass_id=${process.env.ASSISTANT_ID}&agnt_id=${agnt_id}`,
          input: ["speech"],
          speechTimeout: "2",
          method: "post",
          speechModel: "experimental_conversations",
        });
      } else if (
        agentResponse.action == "end_call" &&
        agentResponse.isActionConfirmation == false
      ) {
        twiml.say(agentResponse.responseMessage);
        twiml.hangup();
      } else if (
        agentResponse.action == "forward_call_to_human_agent" &&
        agentResponse.isActionConfirmation == false
      ) {
        twiml.say(agentResponse.responseMessage);

        const business = await this.businessService.getBusiness(bus_id);

        logger(business?.humanOperatorPhoneNumbers);

        if (
          !business?.humanOperatorPhoneNumbers ||
          business.humanOperatorPhoneNumbers.length < 1
        ) {
          twiml.say(
            "Sorry, I'm unable to transfer you. It seems no human operator phone numbers was provided by the business. Please visit our website for a number to call. Good bye, and have a great day."
          );

          twiml.hangup();
          return;
        }

        const phoneNumber =
          business.humanOperatorPhoneNumbers[
            Math.floor(
              Math.random() * business.humanOperatorPhoneNumbers.length
            )
          ];

        const dial = twiml.dial();
        dial.number(phoneNumber);
      } else if (
        agentResponse.action != null &&
        agentResponse.isActionConfirmation == false
      ) {
        twiml.say(agentResponse.responseMessage);

        const agent: IAgent = await this.getAgentAction(
          agnt_id,
          agentResponse.action
        );

        if (!agent.allowedActions) throw new Error("Invalid action");

        const response = await axios({
          method: "POST",
          url: agent.agentWebhook,
          data: {
            action: agentResponse.action,
            schemaData: agentResponse.schemaData,
          },
        });

        logger(response.data);

        twiml.pause({
          length: 5,
        });

        const userMessage =
          await this.openAiClient.beta.threads.messages.create(th_id, {
            role: "user",
            content: JSON.stringify({
              businessId: bus_id,
              customerInput: "",
              actionResult: response.data,
            }),
          });

        logger("action result message ", userMessage);

        twiml.say("Please hold. I am confirming the status of your request.");

        let runObject = await this.openAiClient.beta.threads.runs.createAndPoll(
          th_id,
          {
            assistant_id: ass_id,
          }
        );

        logger("action result run ", runObject);

        twiml.redirect(
          `/agent/call/responder?bus_id=${bus_id}&th_id=${th_id}&ass_id=${process.env.ASSISTANT_ID}&run_id=${runObject.id}&agnt_id=${agnt_id}`
        );

        logger("After redirect!!!");
        const toolCalls =
          runObject.required_action?.submit_tool_outputs.tool_calls;

        if (toolCalls) {
          const functionCallOutputs: any = await Promise.all(
            toolCalls.map(async (toolCall) => {
              // logger(toolCall);
              logger("Function called: ", toolCall.function.name);

              const args = JSON.parse(toolCall.function.arguments);

              if (toolCall.function.name == "getBusiness") {
                return {
                  output: JSON.stringify(
                    await this.businessService.getBusinessAndAgent(
                      args.id,
                      args.agentId
                    )
                  ),
                  tool_call_id: toolCall.id,
                };
              } else if (toolCall.function.name == "getBusinessKnowledgeBase") {
                return {
                  output: JSON.stringify(
                    await this.businessService.getBusinessKnowledgeBase(args.id)
                  ),
                  tool_call_id: toolCall.id,
                };
              }
            })
          );

          runObject =
            await this.openAiClient.beta.threads.runs.submitToolOutputsAndPoll(
              th_id,
              runObject.id,
              { tool_outputs: functionCallOutputs }
            );

          if (runObject.usage)
            this.usageService.addTokenUsage(
              runObject.usage,
              bus_id,
              th_id,
              agnt_id
            );
        }
      } else {
        logger("agent response in else block", agentResponse);
      }
    } catch (error: any) {
      logger(error);
      twiml.say("Sorry, an error has occurred. Please try again later.");
      twiml.hangup();

      throw new Error(
        error.message || "An error has occurred. Please try again later."
      );
    }
  }

  public async actionResponder(
    twiml: VoiceResponse,
    th_id: string,
    bus_id: string,
    ass_id: string,
    run_id: string,
    agnt_id: string
  ) {
    try {
      logger("inside action responder!!!");
      const run = await this.openAiClient.beta.threads.runs.retrieve(
        th_id,
        run_id
      );

      while (true) {
        if (run.completed_at != null) {
          const message = (
            await this.openAiClient.beta.threads.messages.list(th_id)
          ).data;

          let lastMessage = message[0].content[0];
          let messageText: any;

          if (lastMessage.type == "text") {
            messageText = lastMessage.text.value
              .replace(/```json|```/g, "")
              .trim();
          }

          const agentResponse = JSON.parse(messageText);

          twiml.say(agentResponse.responseMessage);

          twiml.gather({
            action: `/agent/call/analyze?bus_id=${bus_id}&th_id=${th_id}&ass_id=${process.env.ASSISTANT_ID}&agnt_id=${agnt_id}`,
            input: ["speech"],
            speechTimeout: "2",
            method: "post",
            speechModel: "experimental_conversations",
          });

          break;
        }
      }
      return twiml;
    } catch (error: any) {}
  }

  public async addActions(
    actions: {
      action: string;
      schemaData: {
        key: string;
        keyDescription: string;
      }[];
    }[],
    agentId: string,
    businessId: string
  ) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const updatedAgent = await agentModel.findByIdAndUpdate(
        agentId,
        {
          allowedActions: actions,
        },
        { new: true }
      );

      if (!updatedAgent)
        throw new Error("Unable to setup agent actions, please try again.");

      logger(updatedAgent);
    } catch (error: any) {
      logger(error);
      throw new Error(
        error || "Unable to setup agent actions, please try again."
      );
    }
  }

  /** Adds a single action to agent's list of allowed actions */
  public async addAgentAction(
    action: {
      action: string;
      schemaData: {
        key: string;
        keyDescription: string;
      }[];
    },
    agentId: string,
    businessId: string
  ) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const updatedAgent = await agentModel.findByIdAndUpdate(
        agentId,
        {
          $push: {
            allowedActions: action,
          },
        },
        { new: true }
      );

      if (!updatedAgent)
        throw new Error("Unable to setup agent actions, please try again.");

      logger(updatedAgent);
    } catch (error: any) {
      logger(error);
      throw new Error(
        error || "Unable to setup agent actions, please try again."
      );
    }
  }

  public async removeAction(
    businessId: string,
    actionId: string,
    agentId: string
  ) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const updatedAgent = await agentModel.findOneAndUpdate(
        { _id: new ObjectId(agentId), businessId: new ObjectId(businessId) },
        { $pull: { allowedActions: { _id: new ObjectId(actionId) } } },
        { new: true }
      );

      if (!updatedAgent)
        throw new Error("Unable to remove agent action, please try again.");
    } catch (error: any) {
      throw new Error(
        error || "Unable to remove agent action, please try again."
      );
    }
  }

  public async getAgentActions(agentId: string) {
    try {
      const actions = await agentModel
        .findById(agentId)
        .select("allowedActions");

      if (!actions) throw new Error("Actions not found.");

      return actions;
    } catch (error: any) {
      throw new Error(
        error || "Unable to retrieve agent actions, please try again."
      );
    }
  }

  public async getAgentAction(agentId: string, actionKeyword: string) {
    try {
      const action = await agentModel.findOne(
        {
          _id: new ObjectId(agentId),
          "allowedActions.action": actionKeyword,
        },
        { "allowedActions.$": 1, agentWebhook: 1 }
      );

      if (!action) throw new Error("action not found.");

      logger(action);

      return action;
    } catch (error: any) {
      throw new Error(
        error || "Unable to retrieve agent action, please try again."
      );
    }
  }

  public async configureAgent(
    agentId: string,
    agentWebhook: string
  ): Promise<IAgent> {
    try {
      const updatedAgent = await agentModel.findOneAndUpdate(
        {
          _id: new ObjectId(agentId),
        },
        {
          agentWebhook,
        },
        { new: true }
      );

      if (!updatedAgent)
        throw new Error("Unable to update business. Please try again.");

      return updatedAgent;
    } catch (error: any) {
      throw new Error(error || "Unable to update business. please try again.");
    }
  }

  public async getAvailablePhoneNumbers(country: string) {
    try {
      const availableNumbers = await this.twilioClient
        .availablePhoneNumbers(country)
        .local.list();
      const price = await this.twilioClient.pricing.v1.phoneNumbers
        .countries(country)
        .fetch();
      logger(availableNumbers);

      const response = {
        availableNumbers,
        price,
      };

      return response;
    } catch (error: any) {
      throw new Error(
        error || "Unable to retrieve available phone numbers. Please try again."
      );
    }
  }

  public async buyPhoneNumber(
    number: string,
    country: string,
    businessId: string,
    agentId: string
  ): Promise<void> {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const subTwilioClient = twilio(
        business.twilioAccount.sid,
        business.twilioAccount.authToken
      );

      //TODO: Uncomment when call is ready to ship!

      // const purchasedNumber = await subTwilioClient.incomingPhoneNumbers.create(
      //     {
      //         phoneNumber: number,
      //         voiceUrl:
      //             "https://jawfish-needed-safely.ngrok-free.app/support/call/accept",
      //         voiceMethod: "POST",
      //         friendlyName: business.name,
      //     }
      // );

      const price = await this.twilioClient.pricing.v1.phoneNumbers
        .countries(country)
        .fetch();
      logger(price);

      const updatedAgent = await agentModel.findByIdAndUpdate(
        agentId,
        {
          $push: {
            agentPhoneNumbers: {
              phoneNumber: number,
              country: price.country,
              isoCountry: price.isoCountry,
              numberType: "local",
              basePrice: (price.phoneNumberPrices[0].basePrice || 1.15) * 100, // amount in cents
              currentPrice:
                (price.phoneNumberPrices[0].currentPrice || 1.15) * 100,
              priceUnit: price.priceUnit,
            },
          },
        },
        { new: true }
      );

      logger(updatedAgent?.agentPhoneNumbers);
    } catch (error: any) {
      throw new Error(
        error || "Unable to purchase phone number. Please try again."
      );
    }
  }
}

export default AgentService;
