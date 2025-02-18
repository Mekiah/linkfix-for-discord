import dotenv from "dotenv";
import {
  REST,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord.js";
import { Commands } from "../commands";
/* eslint-disable-next-line import/no-extraneous-dependencies --
 * HACK: I should really break this CLI script out into its own project.
 */
import { Command, Option } from "commander";

/**
 * Helper function for delaying async functions.
 * Declared here to solve no-loop-func eslint errors.
 * @param delay Time to sleep, in seconds
 * @returns
 */
const sleep: (delay: number) => Promise<void> = async (delay) => {
  return new Promise(() => {
    setTimeout(() => {}, delay * 1000);
  });
};

/**
 * Make sure we are running either globally or on a guild.
 * @param {{global: boolean, guildId: string | undefined}} args - CLI args passed to the program
 * @returns true (validated) | false (error validating)
 */
const validateScope: (args: {
  global: boolean;
  guildId: string | undefined;
}) => boolean = (args) => {
  if (!args.global && !args.guildId) {
    console.error(
      "error: please specify option '--global' or '--guild-id <Guild ID>'.",
    );
    return false;
  }
  return true;
};

/**
 * Make sure we are deleting either one command by ID or all commands.
 * @param {{deleteAll: boolean, commandId: string | undefined}} args CLI args passed to the program.
 * @returns true (validated) | false (error validating)
 */
const validateDeletionScope: (args: {
  deleteAll: boolean;
  commandId: string | undefined;
}) => boolean = (args) => {
  if (!args.deleteAll && !args.commandId) {
    console.error(
      "error: please specify option '--delete-all' or '--command-id <Command ID>'.",
    );
    return false;
  }
  return true;
};

/**
 * Ensure valid Discord bot token is pulled from ENV
 * @returns true (valid token) | false (invalid token)
 */
const validateToken: () => boolean = () => {
  if (typeof process.env.DISCORD_BOT_TOKEN !== "string") {
    console.error("process.env.DISCORD_BOT_TOKEN is undefined!");
    return false;
  }
  return true;
};

/**
 * Synchronize application commands used by the bot with Discord's REST API
 * @param {{clientId: string, global: boolean, guildId: string | undefined}} args - CLI args passed to the program
 */
const syncCommands: (args: {
  clientId: string;
  global: boolean;
  guildId: string | undefined;
}) => Promise<void> = async (args) => {
  if (!validateScope(args)) {
    return;
  }

  const restClient = new REST();

  if (validateToken()) {
    restClient.setToken(<string>process.env.DISCORD_BOT_TOKEN);
  } else {
    return;
  }

  const commandsJSON: Array<RESTPostAPIChatInputApplicationCommandsJSONBody> = [];
  for (const cmd of Commands) {
    commandsJSON.push(cmd.data.toJSON());
  }

  try {
    let data;

    if (args.global) {
      console.warn(
        `Starting a **GLOBAL** sync of ${commandsJSON.length} application commands...`,
      );

      data = await restClient.put(Routes.applicationCommands(args.clientId), {
        body: commandsJSON,
      });
    } else {
      console.log(
        `Syncing ${commandsJSON.length} application commands for guild ${args.guildId}...`,
      );

      data = await restClient.put(
        Routes.applicationGuildCommands(args.clientId, <string>args.guildId),
        { body: commandsJSON },
      );
    }

    // restClient.put returns an array of objects for application/json requests
    console.log(
      `Successfully synced ${(<Array<object>>data).length} application commands.`,
    );
  } catch (error) {
    console.error(error);
  } finally {
    console.log("All done! Verify your new commands work.");
  }
};

/**
 * Delete one or many application commands using Discord's REST API
 * @param {{clientId: string, global: boolean guildId: string | undefined deleteAll: boolean commandId: string | undefined}} args  - CLI args passed to the program
 */
const deleteCommands: (args: {
  clientId: string;
  global: boolean;
  guildId: string | undefined;
  deleteAll: boolean;
  commandId: string | undefined;
}) => Promise<void> = async (args) => {
  if (!validateScope(args) || !validateDeletionScope(args)) {
    return;
  }

  const restClient = new REST();

  if (validateToken()) {
    restClient.setToken(<string>process.env.DISCORD_BOT_TOKEN);
  } else {
    return;
  }

  if (args.deleteAll && args.global) {
    const timeout = 5;

    console.warn(
      "WARNING: YOU ARE ABOUT TO DELETE **ALL** APPLICATION COMMANDS **GLOBALLY**!",
    );

    console.log(`Waiting ${timeout} seconds to give you a chance to bail...`);

    for (let i = timeout; i > 0; --i) {
      console.log(`${i}...`);
      // https://stackoverflow.com/a/49139664
      await sleep(1);
    }

    console.warn("Time's up!");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(
    `Deleting ${args.deleteAll ? "**ALL** commands" : "command " + args.commandId} ${
      args.global ? "**GLOBALLY**" : "in guild " + args.guildId
    }...`,
  );

  if (args.commandId) {
    if (args.global) {
      restClient
        .delete(Routes.applicationCommand(args.clientId, args.commandId))
        .then(() => {
          console.log(`Successfully deleted command ${args.commandId} globally.`);
        })
        .catch(console.error);
    } else {
      restClient
        .delete(
          Routes.applicationGuildCommand(
            args.clientId,
            <string>args.guildId,
            args.commandId,
          ),
        )
        .then(() => {
          console.log(
            `Successfully deleted command ${args.commandId} in guild ${args.guildId}.`,
          );
        })
        .catch(console.error);
    }
  } else {
    // at this point we know args.deleteAll is true because of validateCommandScope() earlier
    if (args.global) {
      restClient
        .put(Routes.applicationCommands(args.clientId), { body: [] })
        .then(() => {
          console.log("Successfully deleted all commands globally.");
        })
        .catch(console.error);
    } else {
      restClient
        .put(Routes.applicationGuildCommands(args.clientId, <string>args.guildId), {
          body: [],
        })
        .then(() => {
          console.log(`Successfully deleted all commands in guild ${args.guildId}.`);
        })
        .catch(console.error);
    }
  }
};

/**
 * The main function for our CLI application
 */
(() => {
  dotenv.config();

  const program = new Command();

  program
    .name("npx ts-node AppCommandsCLI")
    .description(
      "CLI tool for updating Discord application commands\n\nNOTE: When running via NPM package script, pass '--' before any arguments.\nExample: npm run appcmd-cli -- --help",
    )
    .version("1.6.0");

  program
    .command("sync")
    .description("Synchronize application commands to a guild or globally.")
    .requiredOption("--client-id <Client ID>", "The bot's client ID")
    .addOption(
      new Option("--global", "Update application commands for all guilds")
        .default(false)
        .conflicts("guildId"),
    )
    .option("--guild-id <Guild ID>", "Update application commands for a specific guild")
    .action(
      async (args: {
        clientId: string;
        global: boolean;
        guildId: string | undefined;
      }) => {
        await syncCommands(args);
      },
    );

  program
    .command("delete")
    .description("Delete one or all application commands to a guild or globally.")
    .requiredOption("--client-id <Client ID>", "The bot's client ID")
    .addOption(
      new Option("--global", "Update application commands for all guilds")
        .default(false)
        .conflicts("guildId"),
    )
    .option("--guild-id <Guild ID>", "Update application commands for a specific guild")
    .addOption(
      new Option("--delete-all", "Delete all Application Commands")
        .default(false)
        .conflicts("commandId"),
    )
    .option(
      "--command-id <Command ID>",
      "ID of the specific application command to delete",
    )
    .action(
      async (args: {
        clientId: string;
        global: boolean;
        guildId: string | undefined;
        deleteAll: boolean;
        commandId: string | undefined;
      }) => {
        await deleteCommands(args);
      },
    );

  program.parse();
})();
