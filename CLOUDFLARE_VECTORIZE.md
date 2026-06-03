# Cloudflare Vectorize Setup Guide

## 1. Cloudflare CLI Setup Commands

To create a new Vectorize index named `geometry-theorems` configured for **768 dimensions** using the **cosine** similarity metric, run the following `wrangler` command:

```bash
npx wrangler vectorize index create geometry-theorems --dimensions=768 --metric=cosine
```

## 2. Wrangler Configuration (`wrangler.toml`)

To bind the newly created Vectorize index to your Worker environment, add the following snippet to your `wrangler.toml` file. This securely exposes the index on the `env.THEOREMS_INDEX` binding:

```toml
[[vectorize]]
binding = "THEOREMS_INDEX"
index_name = "geometry-theorems"
```
