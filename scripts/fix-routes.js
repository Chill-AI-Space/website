import { readFileSync, writeFileSync } from "fs";

const file = "dist/_routes.json";
const routes = JSON.parse(readFileSync(file, "utf8"));

const required = ["/portal"];
for (const route of required) {
  if (!routes.include.includes(route)) {
    routes.include.push(route);
  }
}

writeFileSync(file, JSON.stringify(routes, null, 2) + "\n");
console.log("_routes.json patched:", routes.include);
