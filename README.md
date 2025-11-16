This repository is used to generate stage solutions and hints for CodeCrafters challenges.

## 🚀 Usage

### Install dependencies

```bash
bun install
```

### Fetch challenges

StageGen does not currently fetch challenges. You need to place your challenge files under `challenges/<slug>`.

What you need for each challenge:

* `stage_descriptions/`
* `compiled_starters/`
* `solutions/`

Nothing else is required. Do not copy the challenge’s `.git` folder.

For example, to copy the `build-your-own-redis` challenge (assuming you have the local repo):

```
# from your StageGen repo root
mkdir -p challenges/build-your-own-redis

# copy only the three folders from your source challenge repo
cp -R /path/to/source/build-your-own-redis/stage_descriptions challenges/build-your-own-redis/
cp -R /path/to/source/build-your-own-redis/compiled_starters challenges/build-your-own-redis/
cp -R /path/to/source/build-your-own-redis/solutions challenges/build-your-own-redis/

# make sure you did not bring over a .git folder
rm -rf challenges/build-your-own-redis/.git
```

### Environment variables

- `OPENAI_API_KEY` required
- `DRY_RUN=1` to skip writing files

### Run locally

Generate for all languages found under `solutions/*`:

```bash
bun run src/index.ts \
  --challenge-slug build-your-own-redis \
  --stage-id 02-rg2
```

Target a specific set of languages:

```bash
bun run src/index.ts \
  --project-root . \
  --challenge-slug build-your-own-redis \
  --stage-id 02-rg2 \
  --targets javascript,python,go
```

Dry run without writing files:

```bash
DRY_RUN=1 bun run src/index.ts \
  --project-root . \
  --challenge-slug build-your-own-redis \
  --stage-id 02-rg2
```


## 💻 CLI reference

```bash
--project-root <path>            default: cwd
--challenge-slug <slug>          if omitted, derived from folder name
--stage-id <id>                  example: 02-rg2
--stage-kind <base|localized>    default: base
--targets <csv>                  example: javascript,go,python
--refs <csv>                     default: python,rust,go
--model <name>                   default: gpt-5
--lang-concurrency <n>           default: 4
--task-concurrency <n>           default: 2
```

