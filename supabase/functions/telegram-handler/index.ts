console.log(`Function "telegram-bot" up and running!`)

import { Bot, webhookCallback } from 'https://deno.land/x/grammy@v1.22.4/mod.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { supermemo } from "https://deno.land/x/supermemo@2.0.17/mod.ts";
import { Database } from './schema.ts'

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '')
const supabase = createClient<Database>(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')

bot.command('ping', (ctx) => ctx.reply(`Pong! ${new Date()} ${Date.now()}`))
bot.command('start', (ctx) => ctx.reply('Welcome!'))

bot.reaction('❤', async (ctx) => {
  console.log('Reaction to message', ctx)

  const { data, error } = await supabase
    .from('entries')
    .select()
    .match({ chat_id: ctx.chat.id, message_id: ctx.messageReaction?.message_id })

  if (error) {
    console.log('Failed to fetch entry', error)
    return ctx.reply('Failed to fetch entry')
  }

  if (!data || data.length === 0) {
    return ctx.reply('No entry found')
  }

  const entry = data[0]
  const { interval, repetition, efactor } = supermemo(entry, 5)

  const { error: updateError } = await supabase
    .from('entries')
    .update({ interval, repetition, efactor, due_date: nextDueDate(interval) })
    .match({ id: entry.id })

  if (updateError) {
    console.log('Failed to update entry', updateError)
    return ctx.reply('Failed to update entry')
  }

  return ctx.react('👏')
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
    .match({ chat_id: ctx.chat.id })
    .lte('due_date', new Date().toISOString())
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
      // deno-lint-ignore no-explicit-any
      return ctx.react('🤡', { chat_id: reply.chat.id, message_id: reply.message_id } as any)
    })

  return Promise.all(replies)
})

bot.on('message:text', async (ctx) => {
  console.log('Message', ctx)

  const { error } = await supabase
    .from('entries')
    .insert({ chat_id: ctx.chat.id, username: ctx.message.from.username || '', data: ctx.message.text || '' })

  if (error) {
    console.log(error)
    return ctx.reply('Failed to add entry')
  }

  return ctx.react('✍')
})

bot.on('my_chat_member', (ctx) => {
  console.log('Chat member', ctx)
})

const handleUpdate = webhookCallback(bot, 'std/http')

let initialized = false
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

function nextDueDate(interval: number): string {
  const d = new Date();
  d.setDate(d.getDate() + interval);
  return d.toISOString();
}
