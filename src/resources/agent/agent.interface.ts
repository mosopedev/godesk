export default interface IAgent {
  agentName: string;
  agentType: string;
  agentPersona: string;
  agentPhoneNumbers: Array<{
    phoneNumber: String;
    country: string;
    isoCountry: string;
    numberType: string;
    basePrice: string;
    currentPrice: string;
    priceUnit: string;
  }>;
  agentWebhook: string;
  agentPrimaryLanguage: string;
  businessId: string;
  agentApiKey: string;
  agentApiKeySample: string;
  allowedActions?: Array<{
    action: string;
    method: string;
    schemaData: Array<{
      key: string;
      keyDescription: string;
    }>;
  }>;
}
