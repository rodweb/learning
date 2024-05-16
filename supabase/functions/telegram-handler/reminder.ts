import { createMachine, createActor, Snapshot } from "https://deno.land/x/xstate@xstate@5.12.0/src/index.ts";

const stateMachine = createMachine({
    id: 'reminder',
    initial: 'idle',
    context: {
        name: '',
        time: new Date(),
        recurrence: ''
    },
    states: {
        idle: {
            on: { CREATE: 'creating' }
        },
        creating: {
            on: { NAME_SET: 'name_set' }
        },
        name_set: {
            on: { TIME_SET: 'time_set' }
        },
        time_set: {
            on: { RECURRENCE_SET: 'recurrence_set' }
        },
        recurrence_set: {
            on: { SAVE: 'saving' }
        },
        saving: {
            on: { SAVED: 'idle' }
        }
    }
})

export async function handler(repo: StateRepo) {
    const snapshot = (await repo.GetSnapshot('') ?? undefined)
    const actor = createActor(stateMachine, {
        snapshot,
    })
    actor.start()
    actor.send({ type: 'CREATE' })
    await repo.SaveSnapshot(actor.getPersistedSnapshot())
}

interface StateRepo {
    GetSnapshot(id: string): Promise<Snapshot<unknown>>
    SaveSnapshot(snapshot: Snapshot<unknown>): Promise<void>
}