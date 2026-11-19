/**
 * The known hosts in the main process (connection.trust-host-key): `known-hosts.json` loaded at start, and the
 * `HostKeyCheck` each SSH tunnel is opened with. A key equal to the remembered one connects; another one is given to
 * the feature, whose question and confirmation open in the window when a person started the connection, and whose
 * step is carried out here. The check runs inside the plan that connects, so it does not queue a plan of its own.
 */
import type { Answers, Context, Plan, StartedBy } from '../shared/feature';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import type { HostKeyCheck } from '../engines';
import { plan as trustPlan, serverKey, trustedAnswer } from '../features/connection/trust-host-key';
import { confirmationOf } from '../runner/run';
import { writeLog } from '../runner/log';
import { notify } from '../runner/notify';
import { knownHostsFile, withHostKey, type KnownHosts } from '../storage/known-hosts';
import { Store } from '../storage/store';
import type { AreaStart } from './areas';
import type { MainServices } from './services';

interface Known {
  readonly services: MainServices;
  readonly store: Store<KnownHosts>;
}

let known: Known | undefined;

const feature = featureId('connection.trust-host-key');

/** Loads `known-hosts.json`; at quit, writes it. */
export const start: AreaStart = async (services) => {
  const ports = { state: services.state, now: () => Date.now() };
  const store = new Store(services.dataFolder, knownHostsFile, (error: unknown) => {
    notify(ports, {
      feature,
      level: 'error',
      text: `The known hosts could not be saved: ${error instanceof Error ? error.message : String(error)}`,
    });
  });
  await store.load();
  known = { services, store };
  services.onQuit(() => store.flush());
};

function need(): Known {
  if (known === undefined) {
    throw new Error('The known hosts are not loaded yet.');
  }
  return known;
}

/** `connection.remember-host-key` `{ server, fingerprint }`: writes the fingerprint of a server in the known hosts. */
export function rememberHostKey(server: string, fingerprint: string): void {
  const { store } = need();
  store.set(withHostKey(store.get(), server, fingerprint));
}

/** The fingerprint remembered for a server, `host:port`. */
export function rememberedKey(server: string): string | undefined {
  return need().store.get().hosts[server];
}

/** Carries out the plan the feature returned: the confirmation of a changed key, then the step. */
async function carryOut(services: MainServices, context: Context, plan: Plan): Promise<boolean> {
  if (plan.danger.kind !== 'none' && !(await services.dialogs.confirm(feature, confirmationOf(plan, context)))) {
    return false;
  }
  for (const step of plan.steps) {
    if (step.kind === 'app' && step.action === 'connection.remember-host-key') {
      const { server, fingerprint } = step.args as { server: string; fingerprint: string };
      rememberHostKey(server, fingerprint);
      writeLog({ state: services.state, now: () => Date.now() }, [{ feature, kind: 'info', text: step.text }]);
    }
  }
  return true;
}

/** Asks the feature what to do with a key that is not the remembered one, and does it. */
async function decide(services: MainServices, startedBy: StartedBy, args: Answers['args']): Promise<boolean> {
  const context: Context = {
    feature,
    now: Date.now(),
    platform: services.platform,
    startedBy,
    target: appTarget,
    state: services.state.get(),
  };
  let answers: Answers = { args };
  for (let round = 0; round < 3; round += 1) {
    const outcome = trustPlan(context, answers);
    switch (outcome.kind) {
      case 'ask': {
        const answered = await services.dialogs.ask(feature, outcome.question);
        if (answered === undefined) {
          return false;
        }
        answers = { ...answers, ...answered, [trustedAnswer]: true };
        break;
      }
      case 'run':
        return outcome.plan.steps.length > 0 && carryOut(services, context, outcome.plan);
      case 'refuse':
        writeLog({ state: services.state, now: () => Date.now() }, [
          { feature, kind: 'refusal', text: `refused: ${outcome.code} ${outcome.message}` },
        ]);
        return false;
      case 'read':
        return false;
    }
  }
  return false;
}

/**
 * The check of the host keys of a connection's tunnel: compares with the known hosts and, for a key not known, asks
 * when a person started the connection; a scheduled task, a tool of the MCP server or a reconnection does not ask.
 */
export function hostKeyCheck(startedBy: StartedBy): HostKeyCheck {
  return async (server, fingerprint) => {
    const { services } = need();
    const remembered = rememberedKey(serverKey(server.host, server.port));
    if (remembered === fingerprint) {
      return true;
    }
    const args = {
      host: server.host,
      port: server.port,
      fingerprint,
      ...(remembered === undefined ? {} : { remembered }),
    };
    return decide(services, startedBy, args);
  };
}
