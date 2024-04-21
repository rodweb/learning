import { Middleware, NextFunction } from "https://deno.land/x/grammy@v1.22.4/mod.ts";
import { Bot, Context } from "https://deno.land/x/grammy@v1.22.4/mod.ts";

export function debug(token: string): Middleware {
    const bot = new Bot(token);
    return function debugMiddleware(ctx: Context, next: NextFunction) {
        console.log('Update', ctx)
        // Do not wait for the promise to resolve
        ctx.getChat()
            .then(chat => bot.api.sendMessage(chat.id, Deno.inspect(ctx)))
            .catch(console.error)
        return next()
    }
}