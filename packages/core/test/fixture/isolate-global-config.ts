import path from "path"

process.env.XDG_CONFIG_HOME = path.join(import.meta.dir, "empty-global-config")
