import Joi from "joi";

export const buyPhoneNumber = Joi.object({
  businessId: Joi.string().required().label("Business ID"),
  phoneNumber: Joi.string().required().label("Phone Number"),
  country: Joi.string().required().label("Country Code"),
  agentId: Joi.string().required().label("Agent ID"),
});

export const configureAgent = Joi.object({
  agentId: Joi.string().required().label("Agent ID"),
  webhook: Joi.string().required(),
});

export const createAgent = Joi.object({
  agentName: Joi.string().required().label("Agent Name"),
  agentType: Joi.string().required().label("Agent Type"),
  agentPrimaryLanguage: Joi.string().required().label("Agent Language"),
  businessId: Joi.string().required().label("Business ID"),
});

export const addAgentActions = Joi.object({
  businessId: Joi.string().required().label("Business ID"),
  agentId: Joi.string().required(),
  actions: Joi.array().items(
    Joi.object({
      action: Joi.string().required(),
      schemaData: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          keyDescription: Joi.string().required(),
        })
      ),
    }).required()
  ),
});

export const addAgentAction = Joi.object({
  businessId: Joi.string().required().label("Business ID"),
  agentId: Joi.string().required(),
  action: Joi.object({
    action: Joi.string().required(),
    schemaData: Joi.array().items(
      Joi.object({
        key: Joi.string().required(),
        keyDescription: Joi.string().required(),
      })
    ),
  }).required(),
});

export const removeAction = Joi.object({
  businessId: Joi.string().required().label("Business ID"),
  actionId: Joi.string().required().label("Action ID"),
  agentId: Joi.string().required().label("Agent ID"),
});
