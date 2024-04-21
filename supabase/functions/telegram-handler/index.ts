console.log(`Function "telegram-bot" up and running!`)

import { API_CONSTANTS, Bot, webhookCallback } from 'https://deno.land/x/grammy@v1.22.4/mod.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { supermemo } from "https://deno.land/x/supermemo@2.0.17/mod.ts";
import { Database } from './schema.ts'
import { debug } from './debug.ts';

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '')
const supabase = createClient<Database>(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')

bot.use(debug(Deno.env.get('TELEGRAM_BOT_DEBUG_TOKEN') || ''))

bot.command('ping', (ctx) => ctx.reply('Pong!'))
bot.command('start', (ctx) => ctx.reply('Welcome!'))

bot.reaction('❤', async (ctx) => {
  const { data, error } = await supabase
    .from('flashcards')
    .select()
    .match({ chat_id: ctx.chat.id, last_message_id: ctx.messageReaction?.message_id })

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
    .from('flashcards')
    .update({ interval, repetition, efactor, due_date: nextDueDate(interval) })
    .match({ id: entry.id })

  if (updateError) {
    console.log('Failed to update entry', updateError)
    return ctx.reply('Failed to update entry')
  }

  return ctx.react('👏')
})

bot.command('flashcard', async (ctx) => {
  const { error } = await supabase
    .from('interactions')
    .insert({ chat_id: ctx.chat.id, message_id: ctx.message?.message_id || 0, state: 'front' })
  if (error) {
    console.log('Failed to add interaction', error)
    return ctx.reply('Failed to add interaction')
  }
  return ctx.reply('Please enter the front side of the flashcard')
})

bot.command('review', async (ctx) => {
  let limit = 10
  if (typeof ctx.match === 'string') {
    limit = parseInt(ctx.match, 10)
  }

  const { data, error } = await supabase
    .from('flashcards')
    .select()
    .match({ chat_id: ctx.chat.id })
    .lte('due_date', new Date().toISOString())
    .not('front', 'is', null)
    .limit(limit)

  if (error) {
    console.log('Failed to fetch entry', error)
    return ctx.reply('Failed to fetch entry')
  }

  if (!data || data.length === 0) {
    return ctx.reply('No entries to review')
  }

  const updates = await Promise.all(data.map(async (entry) => {
    const reply = await ctx.reply(entry.front || '')
    const { error } = await supabase
      .from('flashcards')
      .update({ last_message_id: reply.message_id })
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

bot.on('edited_message:text', async (ctx) => {
  await Promise.all([
    supabase
      .from('entries')
      .update({ data: { type: 'text', text: ctx.editedMessage?.text || '' } })
      .match({ chat_id: ctx.chat.id, message_id: ctx.editedMessage?.message_id || 0 }),
    supabase
      .from('flashcards')
      .update({ front: ctx.editedMessage?.text || '' })
      .match({ chat_id: ctx.chat.id, message_id: ctx.editedMessage?.message_id || 0 }),
  ])
})

bot.on('message:text', async (ctx) => {
  const { data, error } = await supabase
    .from('interactions')
    .select()
    .match({ chat_id: ctx.chat.id })
  if (error) {
    console.log('Failed to fetch interaction', error)
    return ctx.reply('Failed to fetch interaction')
  }
  const interaction = data?.[0]
  if (interaction?.state === 'front') {
    const { error: updateError } = await supabase
      .from('flashcards')
      .insert({ chat_id: ctx.chat.id, last_message_id: interaction.message_id, username: ctx.message.from.username || '', front: ctx.message.text })
    if (updateError) {
      console.log('Failed to add entry', updateError)
      return ctx.reply('Failed to add entry')
    }
    const { error: interactionUpdateError } = await supabase
      .from('interactions')
      .update({ state: 'back' })
      .match({ chat_id: ctx.chat.id, message_id: interaction.message_id })
    if (interactionUpdateError) {
      console.log('Failed to update interaction', interactionUpdateError)
      return ctx.reply('Failed to update interaction')
    }
    return ctx.reply('Please enter the back side of the flashcard')
  }

  if (interaction?.state === 'back') {
    const { error: updateError } = await supabase
      .from('flashcards')
      .update({ back: ctx.message.text })
      .match({ chat_id: ctx.chat.id, last_message_id: interaction.message_id })
    if (updateError) {
      console.log('Failed to update entry', updateError)
      return ctx.reply('Failed to update entry')
    }
    const { error: deleteError } = await supabase
      .from('interactions')
      .delete()
      .match({ chat_id: ctx.chat.id, message_id: interaction.message_id })
    if (deleteError) {
      console.log('Failed to delete interaction', deleteError)
      return ctx.reply('Failed to delete interaction')
    }

    return ctx.reply('Flashcard added')
  }

  const { error: getError } = await supabase
    .from('entries')
    .insert({
      chat_id: ctx.chat.id,
      message_id: ctx.message.message_id,
      username: ctx.message.from.username || '',
      data: {
        type: 'text',
        text: ctx.message.text || '',
      }
    })

  if (getError) {
    console.log(error)
    return ctx.reply('Failed to add entry')
  }

  return ctx.react('✍')
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
    bot.api.setWebhook(url, { allowed_updates: API_CONSTANTS.ALL_UPDATE_TYPES }),
    bot.api.setMyCommands([
      { command: 'ping', description: 'Test the bot' },
      { command: 'review', description: 'Review due entries' },
      { command: 'flashcard', description: 'Add a flashcard' },
    ]),
  ]);
}

function nextDueDate(interval: number): string {
  const d = new Date();
  d.setDate(d.getDate() + interval);
  return d.toISOString();
}
