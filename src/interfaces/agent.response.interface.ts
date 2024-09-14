export default interface IAgentResponse {
    businessId: string;
    intentUnderstood: boolean;
    intentAllowed: boolean;
    isActionConfirmation: boolean;
    responseMessage: string;
    action: string;
    schemaData: {};
    actionResponse?: string;
}