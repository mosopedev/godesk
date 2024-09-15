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
import { CohereClient } from "cohere-ai";
import { randomUUID } from "crypto";

class AgentService {
  private readonly openAiClient = new OpenAI({
    organization: process.env.OPENAI_ORG_ID,
    project: process.env.OPENAI_PROJECT_ID,
    apiKey: process.env.OPENAI_SECRET_KEY,
  });
  private readonly cohereClient = new CohereClient({
    token: process.env.COHERE_API_KEY,
  });
  private readonly twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  private readonly businessService = new BusinessService();
  private readonly usageService = new UsageService();
  private readonly coherePreamble = `You are an Intent Analyzer for a customer service agent assisting customers across various businesses. Each business has unique operations, rules, and capabilities.
You can find your name and persona in the response from the getBusiness function as fields agentName and agentPersona. Your responses should be in line with your persona. If agentPersona is the default, then reply naturally.

The only function calls you are allowed to make are getBusiness and getBusiessKnowledgeBase!!! Do not call any other functions aside from these 2.!!!

When handling a call, you'll receive:
* **businessId:** The specific business the customer is contacting.
agentId: The id of the agent performing the actions.
* **customerInput:** The customer's spoken request.
actionResult: the result of the action performed e.g the order information

**Your only task is to :**
1. **Understand the customer's intent:** Based on the customer's input and the business's information.
2. **Generate a response:** Provide a JSON response with:
 - intentUnderstood: A boolean indicating whether you understood the customer's intent.
   - intentAllowed: A boolean indicating whether the intended action is allowed based on the business's allowedActions list.
   - responseMessage: A human-like message that you would say to the customer. Note that before an action that may update the business's API e.g cancel_order_by_id, you must ask the customer for confirmation of their action in the responseMessage and set isActionConfirmation field to true in the output JSON. 

   - action: The action e.g get_order_by_id, note the allowed actions for the current business would be included in the response from the getBusiness(businessId)  function call.

   - schemaData: the action's schemaData which must match the key field of the action object and must be filed from the user's input. Note that often times you may need to ask the user to provide information to be used to fill some fields here. Note, that the schemaData keys must be exactly the same as the key specified in the action object!!!! This is very important.

- isActionConfirmation: set to true when you want the user to confirm the action before the action is done, otherwise false.  Only provide the action and schemaData after user confirms the actions or when you are sure no further information is needed from the user to perform the action.

Response JSON Format example:
{
  businessId: "02116ce25aac",
  "intentUnderstood": true,
  "intentAllowed": true,
"isActionConfirmation":  false,
  "responseMessage": "The order with id  has been cancelled, is there any other thing you'd need help with ?",
  "action": "cancel_order",
  "schemaData": 
    {
      orderId: "23445",
     orderDate: 2024-09-34
    }
}
Always! output the specified json format, never just text.

Important notes:
* If an action requires user confirmation, ask before proceeding.

*Remember it is an active call between you and the customer so your responses should feel humanly as possible.

*If a user requests an action that is not listed in the business's allowed actions, simply respond based on relevant information from the business knowledge base, if no relevant information is found in the knowledge base then inform user that you are not allowed to perform such action, and if they want they can speak with a human agent. Wait for their response to confirm they want to be transferred to a human agent.  in this case, the response JSON will have action as forward_call_to_human_agent and isActionConfirmation field as true when asking user if they want to transfer.

*Once the user has confirmed they want to be forwarded to a human agent, you do not end the call, just output the action as forward_call_to_human_agent and the isActionConfirmation as false in the output json after they have provided consent to be transferred.

* Use the business's information to provide accurate and helpful responses.

* Be concise and friendly in your responses.

* Do not mention the words "knowledge base" or "allowed actions". Say things like based on "what I know and the actions I am permitted to perform ....". It's important to have a human-type speech, you can use filler words like umm when not sure of something. * Remember it is a phone call!

*for the output JSON remember the following: 
1. the action and isActionConfirmation must both be null and false respectively, when you just want to respond to the user.
2. the action should be a valid action keyword, and isActionConfirmation must be true when you want the user to confirm before an action is performed or provide you with more information to fill the action's schemaData so that the action isn't performed with incomplete data which would ultimately cause the request to fail.
3. the action should be a valid action keyword and isActionConfirmation must be false when you have all the information for the schemaData and want the agent to perform the action immediately.

Always! output the specified json format only, no further text is required!!!
`;

  public async createAgent(
    agentName: string,
    agentType: string,
    agentPrimaryLanguage: string,
    businessId: string
  ) {
    try {
      const agent = agentModel.create({
        agentName,
        agentType,
        agentPrimaryLanguage,
        businessId,
      });

      if (!agent) throw new Error("Unable to create agent. Please try again.");

      return agent;
    } catch (error: any) {
      throw new Error(error || "Unable to create agent. Please try again.");
    }
  }

  public async acceptCall(twiml: VoiceResponse, agentPhoneNumber: string) {
    try {
      logger(agentPhoneNumber);

      const agent = await agentModel.findOne(
        {
          'agentPhoneNumbers.phoneNumber': agentPhoneNumber
        }
      );

      const business = await businessModel.findById(agent.businessId)

      logger(business, agent)


      if (!agent || !business) {
        twiml.say("Invalid Phone Number. No business with phone number found.");
        twiml.hangup();
      }

      twiml.say(
        `Hello, Welcome to ${business.name}. How may I be of service to you today?`
      );

      twiml.gather({
        action: `/agent/call/analyze?bus_id=${business._id}&agnt_id=${agent._id}`,
        input: ["speech"],
        speechTimeout: "2",
        method: "post",
        speechModel: "experimental_conversations",
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
    bus_id: string,
    agnt_id: string,
    speechResult: string,
    actionResult?: string
  ) {
    try {
      const conversationId = randomUUID();

      let response = await this.cohereClient.chat({
        model: "command-r",
        message: JSON.stringify({
          businessId: bus_id,
          agentId: agnt_id,
          customerInput: speechResult,
          actionResult,
        }),
        conversationId: conversationId,
        tools: [
          {
            name: "getBusiness",
            description:
              "Retrieves information about a business, including the agent name, business name, allowed actions, website, country, primary language, support email etc",
            parameterDefinitions: {
              id: {
                description:
                  "the id of the business, it will always be passed to you with the input json that holds the users message",
                type: "string",
                required: true,
              },
              agentId: {
                description: "The ID of the call agent",
                type: "string",
                required: true,
              },
            },
          },
          {
            name: "getBusinessKnowledgeBase",
            description: "Retrieves the parsed knowledge base of the business",
            parameterDefinitions: {
              id: {
                description:
                  "the id of the business, it will always be passed to you with the input json that holds the users message",
                type: "string",
                required: true,
              },
            },
          },
        ],
        preamble: this.coherePreamble,
      });

      logger(response)

      const cohereToolCalls = response.toolCalls;

      logger(cohereToolCalls);

      if (cohereToolCalls) {
        const outputs: any = await Promise.all(
          cohereToolCalls.map(async (toolCall) => {
            logger("Function called: ", toolCall.name);
            logger("Function args ", toolCall.parameters);

            const args = toolCall.parameters;

            if (toolCall.name == "getBusiness") {
              return {
                outputs: await this.businessService.getBusinessAndAgent(
                  args["id"] as string,
                  args["agentId"] as string
                ),
                call: toolCall,
              };
            } else if (toolCall.name == "getBusinessKnowledgeBase") {
              return {
                outputs: await this.businessService.getBusinessKnowledgeBase(
                  args["id"] as string
                ),
                call: toolCall,
              };
            }
          })
        );

        response = await this.cohereClient.chat({
          model: "command-r",
          message: "",
          conversationId: conversationId,
          tools: [
            {
              name: "getBusiness",
              description:
                "Retrieves information about a business, including the agent name, business name, allowed actions, website, country, primary language, support email etc",
              parameterDefinitions: {
                id: {
                  description:
                    "the id of the business, it will always be passed to you with the input json that holds the users message",
                  type: "string",
                  required: true,
                },
                agentId: {
                  description: "The ID of the call agent",
                  type: "string",
                  required: true,
                },
              },
            },
            {
              name: "getBusinessKnowledgeBase",
              description:
                "Retrieves the parsed knowledge base of the business",
              parameterDefinitions: {
                id: {
                  description:
                    "the id of the business, it will always be passed to you with the input json that holds the users message",
                  type: "string",
                  required: true,
                },
              },
            },
          ],
          toolResults: outputs,
          forceSingleStep: true,
          preamble: this.coherePreamble,
        });

      }

      logger(response.text)

      const agentResponse = JSON.parse(response.text);

      await this.actionHandler(agentResponse, twiml, bus_id, agnt_id, conversationId);

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
    bus_id: string,
    agnt_id: string,
    convo_id: string
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
          action: `/agent/call/analyze?bus_id=${bus_id}&agnt_id=${agnt_id}&convo_id=${convo_id}`,
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

        const actionResult = await axios({
          method: "POST",
          url: agent.agentWebhook,
          data: {
            action: agentResponse.action,
            schemaData: agentResponse.schemaData,
          },
        });

        logger(actionResult.data);

        twiml.pause({
          length: 5,
        });

        let response = await this.cohereClient.chat({
          model: "command-r",
          message: JSON.stringify({
            businessId: bus_id,
            agentId: agnt_id,
            customerInput: "",
            actionResult: actionResult.data,
          }),
          conversationId: convo_id,
          tools: [
            {
              name: "getBusiness",
              description:
                "Retrieves information about a business, including the agent name, business name, allowed actions, website, country, primary language, support email etc",
              parameterDefinitions: {
                id: {
                  description:
                    "the id of the business, it will always be passed to you with the input json that holds the users message",
                  type: "string",
                  required: true,
                },
                agentId: {
                  description: "The ID of the call agent",
                  type: "string",
                  required: true,
                },
              },
            },
            {
              name: "getBusinessKnowledgeBase",
              description: "Retrieves the parsed knowledge base of the business",
              parameterDefinitions: {
                id: {
                  description:
                    "the id of the business, it will always be passed to you with the input json that holds the users message",
                  type: "string",
                  required: true,
                },
              },
            },
          ],
          preamble: this.coherePreamble,
        });

        const cohereToolCalls = response.toolCalls;

        logger(cohereToolCalls);

        if (cohereToolCalls) {
          const outputs: any = await Promise.all(
            cohereToolCalls.map(async (toolCall) => {
              logger("Function called: ", toolCall.name);
              logger("Function args ", toolCall.parameters);

              const args = toolCall.parameters;

              if (toolCall.name == "getBusiness") {
                return {
                  outputs: await this.businessService.getBusinessAndAgent(
                    args["id"] as string,
                    args["agentId"] as string
                  ),
                  call: toolCall,
                };
              } else if (toolCall.name == "getBusinessKnowledgeBase") {
                return {
                  outputs: await this.businessService.getBusinessKnowledgeBase(
                    args["id"] as string
                  ),
                  call: toolCall,
                };
              }
            })
          );

          response = await this.cohereClient.chat({
            model: "command-r",
            message: "",
            conversationId: convo_id,
            tools: [
              {
                name: "getBusiness",
                description:
                  "Retrieves information about a business, including the agent name, business name, allowed actions, website, country, primary language, support email etc",
                parameterDefinitions: {
                  id: {
                    description:
                      "the id of the business, it will always be passed to you with the input json that holds the users message",
                    type: "string",
                    required: true,
                  },
                  agentId: {
                    description: "The ID of the call agent",
                    type: "string",
                    required: true,
                  },
                },
              },
              {
                name: "getBusinessKnowledgeBase",
                description:
                  "Retrieves the parsed knowledge base of the business",
                parameterDefinitions: {
                  id: {
                    description:
                      "the id of the business, it will always be passed to you with the input json that holds the users message",
                    type: "string",
                    required: true,
                  },
                },
              },
            ],
            toolResults: outputs,
            forceSingleStep: true,
            preamble: this.coherePreamble,
          });
        }

        const agentActionResponse = JSON.parse(response.text);

        twiml.say(agentActionResponse.responseMessage);

        twiml.gather({
          action: `/agent/call/analyze?bus_id=${bus_id}&agnt_id=${agnt_id}&convo_id=${convo_id}`,
          input: ["speech"],
          speechTimeout: "2",
          method: "post",
          speechModel: "experimental_conversations",
        });
      } else {
        twiml.say("Sorry I was not able to understand your intent. Could you please let me know what you need ?")

        twiml.gather({
          action: `/agent/call/analyze?bus_id=${bus_id}&agnt_id=${agnt_id}&convo_id=${convo_id}`,
          input: ["speech"],
          speechTimeout: "2",
          method: "post",
          speechModel: "experimental_conversations",
        });

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

      const purchasedNumber = await subTwilioClient.incomingPhoneNumbers.create(
        {
          phoneNumber: number,
          voiceUrl:
            "https://godesk.onrender.com/agent/call/accept",
          voiceMethod: "POST",
          friendlyName: business.name,
        }
      );

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
