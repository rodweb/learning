console.log(`Function "telegram-bot" up and running!`)

import { Bot, webhookCallback } from 'https://deno.land/x/grammy@v1.22.4/mod.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')

let initialized = false

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '')

bot.command('ping', (ctx) => ctx.reply(`Pong! ${new Date()} ${Date.now()}`))

bot.reaction('❤', async (ctx) => {
  console.log('Reaction to message', ctx)
  const { error } = await supabase
    .from('entries')
    .update({ reviewed_at: new Date() })
    .match({ message_id: ctx.messageReaction?.message_id })

  if (error) {
    console.log('Failed to update entry', error)
    return ctx.reply('Failed to update entry')
  }

  return ctx.react('👍')
})

bot.command('review', async (ctx) => {
  console.log('Review command', ctx)
  let limit = 3
  if (typeof ctx.match === 'string') {
    limit = parseInt(ctx.match, 10)
  }

  const { data, error } = await supabase
    .from('entries')
    .select()
    .or('reviewed_at.is.null,reviewed_at.lte.' + daysAgo(1).toISOString())
    .order('reviewed_at', { nullsFirst: true })
    .limit(limit)

  if (error) {
    console.log('Failed to fetch entry', error)
    return ctx.reply('Failed to fetch entry')
  }

  if (!data || data.length === 0) {
    return ctx.reply('No entries to review')
  }

  const updates = await Promise.all(data.map(async (entry) => {
    const reply = await ctx.reply(entry.data)
    const { error } = await supabase
      .from('entries')
      .update({ message_id: reply.message_id })
      .match({ id: entry.id })
      return { reply, error }
  }))

  const replies = updates
    .filter(({ error }) => Boolean(error))
    .map(({ reply, error }) => {
      console.log('Failed to update entry', error)
      bot.api.setMessageReaction(reply.chat.id, reply.message_id, ['👎' as any])
      return ctx.react('👎', { chat_id: reply.chat.id, message_id: reply.message_id } as any)
    })

    return Promise.all(replies)
})

bot.on('message', async (ctx) => {
  console.log('Message', ctx)

  const { error } = await supabase
    .from('entries')
    .insert({ data: ctx.message.text })
  if (error) {
    console.log(error)
    ctx.reply('Failed to add entry')
    return
  }

  ctx.react('👍')
})

const handleUpdate = webhookCallback(bot, 'std/http')

Deno.serve(async (req) => {
  try {
    if (!initialized) {
      initialize()
      initialized = true
    }

    const url = new URL(req.url)
    if (url.searchParams.get('secret') !== Deno.env.get('FUNCTION_SECRET')) {
      return new Response('not allowed', { status: 405 })
    }

    return await handleUpdate(req)
  } catch (err) {
    console.error(err)
  }
})

async function initialize() {
  const url = Deno.env.get('FUNCTION_URL') || ''
  await Promise.all([
    bot.api.setWebhook(url, { allowed_updates: ['message', 'message_reaction'] }),
    bot.api.setMyCommands([
      { command: 'ping', description: 'Test the bot' },
      { command: 'review', description: 'Review an entry' },
    ]),
  ])
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
