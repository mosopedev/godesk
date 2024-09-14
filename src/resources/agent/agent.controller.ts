import IController from "@/interfaces/controller.interface";
import logger from "@/utils/logger";
import { Router, Request, NextFunction, Response } from "express";
import OpenAI from "openai";
import * as validation from "../agent/agent.validation";
import twilio from "twilio";
import Voice from "twilio/lib/rest/Voice";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import AgentService from "./agent.service";
import HttpException from "../../exceptions/http.exception";
import successResponse from "@/utils/success";
import validationMiddleware from "@/middlewares/validation.middleware";
import authenticatedMiddleware from "@/middlewares/authenticate.middleware";

class AgentController implements IController {
  public readonly path = "/agent";
  public readonly router = Router();
  private readonly agentService = new AgentService();
  private readonly openAiClient = new OpenAI({
    organization: process.env.OPENAI_ORG_ID,
    project: process.env.OPENAI_PROJECT_ID,
    apiKey: process.env.OPENAI_SECRET_KEY,
  });
  private readonly client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  constructor() {
    this.initializeEndpoints();
  }

  private initializeEndpoints(): void {
    this.router.post(`${this.path}/create`, authenticatedMiddleware, validationMiddleware(validation.createAgent), this.createAgent)
    this.router.post(`${this.path}/call/accept`, this.acceptPhoneCall);
    this.router.post(`${this.path}/call/analyze`, this.analyzeCallIntent);
    this.router.post(`${this.path}/call/responder`, this.callActionResponder);
    this.router.get(
      `${this.path}/phones/:country`,
      authenticatedMiddleware,
      this.getAvailableNumbers
    );
    this.router.post(
      `${this.path}/phones/buy`,
      validationMiddleware(validation.buyPhoneNumber),
      authenticatedMiddleware,
      this.purchasePhoneNumber
    );
    this.router.post(
      `${this.path}/actions/create`,
      validationMiddleware(validation.addAgentActions),
      authenticatedMiddleware,
      this.addAgentActions
    );
    this.router.post(
      `${this.path}/actions/add`,
      validationMiddleware(validation.addAgentAction),
      authenticatedMiddleware,
      this.addAgentAction
    );
    this.router.post(
      `${this.path}/actions/remove`,
      validationMiddleware(validation.removeAction),
      authenticatedMiddleware,
      this.removeAgentAction
    );
    this.router.get(
      `${this.path}/:agentId/actions/:action`,
      authenticatedMiddleware,
      this.getAgentAction
    );
    this.router.get(`${this.path}/:agentId`, authenticatedMiddleware, this.getAgentActions)
    this.router.put(
      `${this.path}/configure`,
      validationMiddleware(validation.configureAgent),
      authenticatedMiddleware,
      this.configureAgent
    );
  }

  private createAgent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
        const { agentName, agentType, agentPrimaryLanguage, businessId } = req.body;
        const response = await this.agentService.createAgent(agentName, agentType, agentPrimaryLanguage, businessId)

        successResponse(201, "Agent created successfully", res, response)
    } catch (error: any) {
        logger(error);
      return next(new HttpException(400, error.message));
    }
  }

  private acceptPhoneCall = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const twiml = new VoiceResponse();

      logger(req.body)

      const updatedTwiml = await this.agentService.acceptCall(twiml, req.body.to);

      res.type("text/xml");
      res.send(updatedTwiml.toString());
    } catch (error: any) {
      logger(error);
      return next(new HttpException(400, error.message));
    }
  };

  private analyzeCallIntent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { SpeechResult } = req.body;
      logger(SpeechResult);

      const twiml = new VoiceResponse();

      let { th_id, bus_id, ass_id, agnt_id }: any = req.query;

      const updatedTwiml = await this.agentService.analyzeIntent(
        twiml,
        th_id,
        bus_id,
        ass_id,
        agnt_id,
        SpeechResult
      );

      res.type("text/xml");
      res.send(updatedTwiml.toString());
    } catch (error: any) {
      logger(error);
      return next(new HttpException(400, error.message));
    }
  };

  private callActionResponder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const twiml = new VoiceResponse();

      let { th_id, bus_id, ass_id, run_id, agnt_id }: any = req.query;
      const updatedTwiml = await this.agentService.actionResponder(
        twiml,
        th_id,
        bus_id,
        ass_id,
        run_id,
        agnt_id
      );

      res.type("text/xml");
      res.send(updatedTwiml?.toString());
    } catch (error: any) {
      logger(error);
      return next(new HttpException(400, error.message));
    }
  };

  private addAgentActions = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { agentId, actions, businessId } = req.body;

      await this.agentService.addActions(actions, agentId, businessId);

      successResponse(200, "Agent actions added successful", res);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private addAgentAction = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { agentId, action, businessId } = req.body;

      await this.agentService.addAgentAction(action, agentId, businessId);

      successResponse(200, "Agent action added successful", res);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private removeAgentAction = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { businessId, actionId, agentId} = req.body;

      await this.agentService.removeAction(businessId, actionId, agentId);

      successResponse(200, "Agent action removed successful", res);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private getAgentAction = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { agentId, action } = req.params;

      const response = await this.agentService.getAgentAction(
        agentId,
        action
      );

      successResponse(200, "Agent action retrieved successful", res, response);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private getAgentActions = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { agentId } = req.params;

      const response = await this.agentService.getAgentActions(
        agentId
      );

      successResponse(200, "Agent actions retrieved successful", res, response);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private configureAgent = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { webhook, agentId } = req.body;

      const response = await this.agentService.configureAgent(
        agentId,
        webhook
      );

      successResponse(200, "Business updated successfully", res, response);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private purchasePhoneNumber = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { businessId, phoneNumber, country, agentId } = req.body;

      await this.agentService.buyPhoneNumber(
        phoneNumber,
        country,
        businessId,
        agentId
      );

      successResponse(200, "Phone number purchase successful", res);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };

  private getAvailableNumbers = async (
    req: Request | any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { country } = req.params;

      if (!country) throw new Error("Invalid country code.");

      const response = await this.agentService.getAvailablePhoneNumbers(
        country
      );
      logger(response);
      successResponse(200, "Numbers retrieved successful", res, response);
    } catch (error: any) {
      return next(new HttpException(400, error.message));
    }
  };
}

export default AgentController;
