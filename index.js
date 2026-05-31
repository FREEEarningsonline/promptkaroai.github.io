import fs from "fs";

const topic = "Make Money Online";

const article = `
<h1>${topic}</h1>
<p>This is a sample AI article. Replace with API later.</p>
`;

const slug = topic.toLowerCase().replace(/\s+/g, "-");

fs.writeFileSync(`./blog/${slug}.html`, article);

console.log("Blog created");
