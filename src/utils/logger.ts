export const logger = (...params: any[]): void => {
    process.env.NODE_ENV == 'development' ?
        params.forEach(param => console.log(param)) : ''
}

export default logger