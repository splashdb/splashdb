import { Database } from "rippledb";
import { argv } from "yargs";
import path from "path";
import fs from "fs";

async function main(): Promise<void> {
  console.log(argv);
  const command = argv._[0];
  if (!command) {
    console.log("commands: dump, restore");
    return;
  }
  const dbpath = argv._[1];
  if (!dbpath) {
    console.log("no dbpath");
  }

  const db = new Database(path.resolve(process.cwd(), dbpath));
  await db.ok();

  if (command === "dump") {
    const dumpPath = argv._[2];
    if (!dumpPath) {
      console.log("no dump path");
      return;
    }

    const dumpPathAbsolute = path.resolve(process.cwd(), dumpPath);
    await fs.promises.mkdir(dumpPathAbsolute, { recursive: true });

    let index = 0;
    for await (const entry of db.iterator()) {
      await fs.promises.writeFile(
        path.resolve(dumpPathAbsolute, `./${index}.json`),
        JSON.stringify([entry.key, entry.value]),
      );
      index++;
    }
    console.log(`dump success`);
  } else if (command === "restore") {
    const dumpPath = argv._[2];
    if (!dumpPath) {
      console.log("no dump path");
      return;
    }

    const dumpPathAbsolute = path.resolve(process.cwd(), dumpPath);

    let index = 0;
    while (true) {
      try {
        const content = await fs.promises.readFile(
          path.resolve(dumpPathAbsolute, `./${index}.json`),
          "utf8",
        );
        const json = JSON.parse(content);
        await db.put(json[0].data, json[1].data);
        index++;
      } catch (e) {
        console.log("restore success");
        break;
      }
    }
  } else {
    console.log(`unknown command: ${command}`);
  }

  process.exit(0);
}

main();
