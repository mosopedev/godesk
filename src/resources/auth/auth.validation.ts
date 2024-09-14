import Joi from "joi";

export const signup = Joi.object({
    firstname: Joi.string().required().label('Firstname'),
    lastname: Joi.string().required().label('Lastname'),
    email: Joi.string().email().required().label('Email'),
    password: Joi.string().min(6).required().label('Password')   
})

export const login = Joi.object({
    email: Joi.string().email().required().label('Email'),
    password: Joi.string().required().label('Password')
}) 

export const verifyEmail = Joi.object({
    token: Joi.string().min(5).required().label('Token'),
    email: Joi.string().email().required().label('Email'),
}) 

export const forgotPassword = Joi.object({
    email: Joi.string().email().required().label('Email'),
})

export const resetPassword = Joi.object({
    email: Joi.string().email().required().label('Email'),
    token: Joi.string().min(5).required().label('Token'),
    password: Joi.string().required().label('Password')
})