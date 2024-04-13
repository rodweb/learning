console.log(`Function "telegram-bot" up and running!`)

import { Bot, webhookCallback } from 'https://deno.land/x/grammy@v1.22.4/mod.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
const url = Deno.env.get('FUNCTION_URL') || ''

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '')
bot.api.setWebhook(url, { allowed_updates: ['message', 'message_reaction'] })
bot.api.setMyCommands([
  { command: 'ping', description: 'Test the bot' },
  { command: 'review', description: 'Review an entry' },
])

bot.command('ping', (ctx) => ctx.reply(`Pong! ${new Date()} ${Date.now()}`))

bot.reaction('❤', async (ctx) => {
  console.log('Reaction to message', ctx)
  const { data, error } = await supabase
    .from('entries')
    .select()
    .filter('message_id', 'eq', ctx.messageReaction?.message_id)
    .limit(1)

  if (error) {
    console.log(error)
    ctx.reply('Failed to fetch entry')
    return
  }

  if (!data || data.length === 0) {
    ctx.reply('No entries to review')
    return
  }

  const entry = data[0]
  const { error: updateError } = await supabase
    .from('entries')
    .update({ reviewed_at: new Date() })
    .match({ id: entry.id })

  if (updateError) {
    console.log(updateError)
    ctx.reply('Failed to update entry')
    return
  }

  ctx.react('👍')
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
    .or('reviewed_at.is.null,reviewed_at.lte.'+daysAgo(1).toISOString())
    .order('reviewed_at', { nullsFirst: true })
    .limit(limit)

  if (error) {
    console.log(error)
    ctx.reply('Failed to fetch entry')
    return
  }

  if (!data || data.length === 0) {
    ctx.reply('No entries to review')
    return
  }

  for (const entry of data) {
    const reply = await ctx.reply(entry.data)
    const { error: updateError } = await supabase
      .from('entries')
      .update({ message_id: reply.message_id })
      .match({ id: entry.id })
    if (updateError) {
      console.log(updateError)
      ctx.reply('Failed to update entry')
      return
    }
  }
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
    const url = new URL(req.url)
    if (url.searchParams.get('secret') !== Deno.env.get('FUNCTION_SECRET')) {
      return new Response('not allowed', { status: 405 })
    }

    return await handleUpdate(req)
  } catch (err) {
    console.error(err)
  }
})

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
