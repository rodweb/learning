import { NextFunction } from "https://deno.land/x/grammy@v1.22.4/mod.ts";
import { Bot, Context } from "https://deno.land/x/grammy@v1.22.4/mod.ts";

export const debug = (token: string) => (ctx: Context, next: NextFunction) => {
    console.log('Update', ctx)
    const bot = new Bot(token);
    return (ctx: Context, next: NextFunction) => {
        // Do not wait for the promise to resolve
        ctx.getChat()
            .then(chat => bot.api.sendMessage(chat.id, ctx.toString()))
            .catch(console.error)
        return next()
    }
}