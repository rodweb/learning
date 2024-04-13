// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log(`Function "telegram-bot" up and running!`)

import { Bot, webhookCallback } from 'https://deno.land/x/grammy@v1.22.4/mod.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '')

bot.command('ping', (ctx) => ctx.reply(`Pong! ${new Date()} ${Date.now()}`))

bot.command('add', async (ctx) => {
  if (!ctx.match || ctx.match.length === 0) {
    return
  }

  const { error } = await supabase.from('entries').insert({ data: ctx.match })
  if (error) {
    console.log(error)
    ctx.reply('Failed to add entry')
    return
  }

  ctx.react('✅')
})

bot.command('review', async (ctx) => {
  const { data, error } = await supabase
    .from('entries')
    .select()
    .order('reviewed_at')
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
  ctx.reply(entry.data)
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