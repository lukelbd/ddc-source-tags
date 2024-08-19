import { Denops, fn } from "https://deno.land/x/ddc_vim@v4.0.5/deps.ts#^";
import { exists } from "https://deno.land/std@0.221.0/fs/mod.ts#^";
import { basename, dirname, join } from "https://deno.land/std@0.221.0/path/mod.ts#^";
import { GatherArguments } from "https://deno.land/x/ddc_vim@v4.0.5/base/source.ts#^";
import { BaseSource, Candidate } from "https://deno.land/x/ddc_vim@v4.0.5/types.ts#^";

type Params = {
  cmd: string[]; maxSize: number;
};

const Debug = async (denops: Denops, message: string): Promise<void> => {
  await denops.call("ddc#util#print_error", message, "tags");
}

class LangSource {
  async get(denops: Denops, path: string): string {
    const paths = Object.keys(this);
    if (!paths.includes(path)) await this.add(denops, path);
    return this[path] || "";
  }
  async add(denops: Denops, path: string): void {
    if (path.length == 0) return "";
    const decoder = new TextDecoder();
    const proc = new Deno.Command(
      "ctags", {
        args: ["--print-language", path],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      });
    const { stdout } = await proc.output();
    const lines = decoder.decode(stdout).split(/\r?\n/);
    const parts = lines.length > 0 ? lines[0].split(/:\s+/) : [];
    const lang = parts.length > 0 ? parts.pop() : "";
    this[path] = lang;
  }
}

class KindSource {
  async get(denops: Denops, lang: string, kind: string): string {
    const langs = Object.keys(this);
    if (!langs.includes(lang)) await this.add(denops, lang);
    const kinds = this[lang];
    return kinds[kind] || "";
  }
  async add(denops: Denops, lang: string): void {
    if (lang.length == 0) return "";
    const decoder = new TextDecoder();
    const proc = new Deno.Command(
      "ctags", {
        args: ["--machinable", "--with-list-header=no", "--list-kinds-full=" + lang],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      });
    const { stdout } = await proc.output();
    const lines = decoder.decode(stdout).split(/\r?\n/);
    const kinds = {};
    for (const line of lines) {
      let parts = line.split("\t");
      if (parts.length < 2) continue;
      const [char, kind, ...rest] = parts;
      kinds[char] = kind;
    }
    this[lang] = kinds;
  }
}

export class Source extends BaseSource<Params> {
  constructor() {
    super();
    this.kinds = new KindSource();
    this.langs = new LangSource();
  }

  params(): Params {
    return {
      cmd: ["rg", "^{PLACEHOLDER}[_A-Za-z0-9:-]*\t", "--color=never"],
      maxSize: 200,
    };
  }

  async gather(args: GatherArguments<Params>): Promise<Candidate[]> {
    // Parse parameters
    const current = await fn.expand(args.denops, "%:p");
    const files = await fn.tagfiles(args.denops);
    const paths = await fn.map(args.denops, files, "fnamemodify(v:val, ':p')");
    const str = args.completeStr.replaceAll(/([\\\[\]^$.*])/g, "\\$1");
    const max = Math.max(1, Math.min(args.sourceParams.maxSize, 2000));
    let cmd = args.sourceParams.cmd;
    cmd = cmd.map((s) => s.replace("{PLACEHOLDER}", str));
    cmd = cmd.concat(["--max-count", max.toString()]);

    // Run commands
    const lines = [];
    const reads = [];
    const decoder = new TextDecoder();
    for (const path of paths) {
      if (lines.length >= max) break;
      if (reads.includes(path)) continue;
      const isfile = await exists(path);
      if (isfile === null) continue;
      const head = await dirname(path);
      if (!current.startsWith(head)) continue;
      const proc = new Deno.Command(
        cmd[0], {
          args: [...cmd.slice(1), path],
          stdin: "null",
          stdout: "piped",
          stderr: "piped",
        });
      const { stdout } = await proc.output();
      let opts = decoder.decode(stdout).split(/\r?\n/);
      opts = opts.map((s) => s + "\t" + head);
      lines.push(...opts);
      reads.push(path);
    }

    // Process result
    const trail = (s: string, sep: string): string => s.split(sep).pop() || s;
    const candidates = [];
    for await (const line of lines) {
      if (candidates.length >= max) break;
      const parts = line.split("\t");
      if (parts.length < 5) continue;
      const word = parts[0];
      const path = await join(parts.pop(), parts[1]);
      const menu = await basename(parts[1]);
      const lang = await this.langs.get(args.denops, path);
      const kind = await this.kinds.get(args.denops, lang, parts[3]);
      candidates.push({word: word, kind: kind, menu: menu});
    }
    return candidates;
  }
}
