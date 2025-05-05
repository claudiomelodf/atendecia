require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require("../models");
const { isAuthenticated } = require("./auth"); // Import authentication middleware
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs").promises;
const axios = require("axios"); // Import axios for proxy

// --- OpenAI Client Setup ---
const openaiApiKey = process.env.OPENAI_API_KEY;
const assistantId = process.env.ASSISTANT_ID;
let openaiClient = null;
if (openaiApiKey && assistantId) { // Need both for Assistants API
  try {
    openaiClient = new OpenAI({ apiKey: openaiApiKey });
    console.log("OpenAI client initialized.");
  } catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
  }
} else {
  console.log("Warning: OPENAI_API_KEY or ASSISTANT_ID not set. OpenAI Assistants API integration disabled.");
}

// --- Load Local Product Data ---
let produtos_data = [];
const produtos_json_path = path.join(__dirname, "..", "..", "produtos.json");

const loadProducts = async () => {
  try {
    const data = await fs.readFile(produtos_json_path, "utf-8");
    produtos_data = JSON.parse(data);
    console.log(`Loaded ${produtos_data.length} products from ${produtos_json_path}`);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Warning: ${produtos_json_path} not found.`);
    } else {
      console.error(`Error loading ${produtos_json_path}:`, error);
    }
  }
};
loadProducts(); // Load products when the module initializes

// --- Helper Functions ---
function find_products(query) {
    let results = [];
    const query_lower = query.toLowerCase();
    const keywords = query_lower.split(/\s+/); // Split by whitespace

    for (const product of produtos_data) {
        let match_score = 0;
        const name_lower = (product.nome || "").toLowerCase();
        const desc_lower = (product.descricao_completa || "").toLowerCase();
        const cat_lower = (product.categorias || "").toLowerCase();
        const sku_lower = (product.sku || "").toLowerCase();

        for (const keyword of keywords) {
            if (!keyword) continue; // Skip empty strings
            if (name_lower.includes(keyword)) {
                match_score += 3;
            }
            if (desc_lower.includes(keyword)) {
                match_score += 1;
            }
            if (cat_lower.includes(keyword)) {
                 match_score += 1;
            }
            if (keyword === sku_lower) {
                 match_score += 10; // Higher score for exact SKU match
            }
        }

        if (match_score > 0) {
            const product_copy = { ...product, match_score };
            results.push(product_copy);
        }
    }

    results.sort((a, b) => b.match_score - a.match_score);
    return results.slice(0, 3); // Return top 3 matches
}

// Function to escape special characters in a string for use in a RegExp
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function extractImageUrl(text) {
    // Regex to match either "📸 URL" or "![...](URL)"
    const imageRegex = /\u{1F4F8}\s*(https?:\/\/\S+)|!\[.*?\]\((https?:\/\/\S+)\)/u;
    const match = text.match(imageRegex);
    // Return object with url and the full matched string for easier removal
    if (match) {
        return {
            url: match[1] || match[2],
            fullMatch: match[0]
        };
    }
    return null;
}

// Function to format the final response including logo and image if present
function formatFinalResponse(text, imageInfo) {
    let imageHtml = "";
    let cleanedText = text;

    if (imageInfo && imageInfo.url) {
        // Attempt to remove the specific matched line/string more reliably
        const escapedFullMatch = escapeRegExp(imageInfo.fullMatch);
        const lineRemovalRegex = new RegExp(`^.*?${escapedFullMatch}.*$\n?`, "gm");
        cleanedText = text.replace(lineRemovalRegex, "").trim();

        // If removal failed, try simpler regex as fallback
        if (cleanedText === text) {
             console.warn("Precise line removal failed, attempting broader regex removal for image URL.");
             const regexToRemove1 = /\u{1F4F8}\s*https?:\/\/\S+\n?/gu;
             const regexToRemove2 = /!\[.*?\]\(https?:\/\/\S+\)\n?/g;
             cleanedText = text.replace(regexToRemove1, "").replace(regexToRemove2, "").trim();
        }

        // Create the HTML block with logo and product image (using proxy)
        const proxiedImageUrl = `/proxy-image?url=${encodeURIComponent(imageInfo.url)}`;
        imageHtml = `
            <div style="text-align: center; margin-bottom: 10px;">
                <img src="/images/informatica_logo.png" alt="Cia da Informática Logo" style="max-height: 50px; display: block; margin: 0 auto 10px auto;">
                <img src="${proxiedImageUrl}" alt="Imagem do Produto" style="max-width: 100%; max-height: 300px; display: block; margin: 0 auto;">
            </div>
        `;
    }
    // Combine image HTML (if any) with the cleaned text wrapped in a div for styling
    // Replace newline characters with <br> tags for HTML display
    const textHtml = `<div class="message-text-content">${cleanedText.replace(/\n/g, '<br>')}</div>`;
    return imageHtml + textHtml;
}

function format_product_fallback_text(product) {
    let text = `**Nome:** ${product.nome || "N/A"}\n`;
    // Use 'imagem' field from JSON if available
    const imageUrl = product.imagem || product.imagem_url;
    if (imageUrl) {
        // Add marker for later processing by extractImageUrl
        text += `📸 ${imageUrl}\n`;
    }
    text += `**SKU:** ${product.sku || "N/A"}\n`;
    // Use 'preco' field from JSON if available, format if needed
    let priceText = product.preco_formatado;
    if (!priceText && product.preco) {
        try {
            priceText = parseFloat(product.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        } catch (e) { priceText = product.preco; } // Fallback to raw value if formatting fails
    }
    if (priceText) {
        text += `**Preço:** ${priceText}\n`;
    }
    if (product.preco_pix) {
        text += `**Preço Pix:** ${product.preco_pix}\n`;
    }
    if (product.marca) {
        text += `**Marca:** ${product.marca}\n`;
    }
    if (product.categorias) {
        text += `**Categorias:** ${product.categorias}\n`;
    }
    // Use 'link' field from JSON if available
    const productLink = product.link || product.link_produto;
    if (productLink) {
         text += `**Link:** ${productLink}\n`;
    }
    return text;
}

// --- Image Proxy Route ---
router.get("/proxy-image", async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send("Missing image URL");
    }

    try {
        const response = await axios({
            method: "get",
            url: imageUrl,
            responseType: "stream",
            timeout: 60000 // Increased timeout to 60 seconds
        });

        // Forward the headers (especially content-type)
        res.setHeader("Content-Type", response.headers["content-type"]);
        response.data.pipe(res);
    } catch (error) {
        console.error(`Error proxying image ${imageUrl}:`, error.message);
        // Check if the error is a timeout error
        if (error.code === "ECONNABORTED") {
            console.error(`Timeout occurred while fetching image: ${imageUrl}`);
            res.status(504).send("Timeout fetching image"); // Gateway Timeout
        } else if (error.response) {
            res.status(error.response.status).send("Error fetching image");
        } else {
            res.status(500).send("Error fetching image");
        }
    }
});

// POST /chat
router.post("/chat", isAuthenticated, async (req, res) => {
  const userMessageText = req.body.message;
  const userId = req.session.userId;

  if (!userMessageText) {
    return res.status(400).json({ error: "Mensagem vazia" });
  }

  try {
    // 1. Save user message
    await db.ChatMessage.create({
      userId: userId,
      sender: "user",
      content: userMessageText,
    });

    let rawAssistantResponseText = ""; // Raw text from OpenAI or fallback
    let finalResponseContent = ""; // Final content to be saved/sent (potentially HTML)
    let isHtmlResponse = false;
    let imageInfoFound = null; // For images *in the response*

    // 2. Get assistant response (OpenAI Text or Fallback)
    if (openaiClient && assistantId) {
        // --- OpenAI Text Interaction (using Assistants API) ---
        console.log("Processing text message using Assistants API...");
        try {
            const thread = await openaiClient.beta.threads.create();
            await openaiClient.beta.threads.messages.create(thread.id, {
                role: "user",
                content: userMessageText,
            });
            let run = await openaiClient.beta.threads.runs.create(thread.id, {
                assistant_id: assistantId,
            });

            while (["queued", "in_progress", "cancelling"].includes(run.status)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                run = await openaiClient.beta.threads.runs.retrieve(thread.id, run.id);
            }

            if (run.status === "completed") {
                const messages = await openaiClient.beta.threads.messages.list(thread.id, { order: "asc" });
                const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
                if (assistantMessages.length > 0) {
                    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
                    if (lastAssistantMsg.content && lastAssistantMsg.content.length > 0 && lastAssistantMsg.content[0].type === "text") {
                        rawAssistantResponseText = lastAssistantMsg.content[0].text.value;
                    }
                }
                if (!rawAssistantResponseText) {
                    rawAssistantResponseText = "(Assistente não retornou texto)";
                }
            } else {
                console.error(`OpenAI Run failed with status: ${run.status}`);
                rawAssistantResponseText = `Ocorreu um erro ao processar sua solicitação com OpenAI (Status: ${run.status}).`;
                throw new Error("OpenAI run failed"); // Trigger fallback
            }
        } catch (error) {
            console.error("Error interacting with OpenAI Assistants API or run failed, attempting fallback:", error);
            rawAssistantResponseText = `Erro ao comunicar com o assistente de IA, usando busca local.`;
            // --- Fallback to Local JSON Search on OpenAI Error ---
            const foundProducts = find_products(userMessageText);
            if (foundProducts.length > 0) {
                rawAssistantResponseText += " Encontrei:\n\n";
                foundProducts.forEach(product => {
                    rawAssistantResponseText += format_product_fallback_text(product) + "\n";
                });
            } else {
                rawAssistantResponseText += " Não encontrei produtos na busca local.";
            }
        }
    } else {
      // --- Fallback to Local JSON Search (OpenAI client or Assistant ID not configured) ---
      console.log("OpenAI client or Assistant ID not available, falling back to local search for text message.");
      const foundProducts = find_products(userMessageText);
      if (foundProducts.length > 0) {
        rawAssistantResponseText = "Usando busca local. Encontrei estes produtos:\n\n";
        foundProducts.forEach(product => {
          rawAssistantResponseText += format_product_fallback_text(product) + "\n";
        });
      } else {
        rawAssistantResponseText = "Desculpe, não consegui encontrar produtos com base na sua busca no JSON local.";
      }
    }

    // 3. Process the raw response (extract image info *from response*, format final HTML)
    imageInfoFound = extractImageUrl(rawAssistantResponseText);
    finalResponseContent = formatFinalResponse(rawAssistantResponseText, imageInfoFound);

    // Determine if the final response should be treated as HTML
    isHtmlResponse = true; // Always treat as HTML now since we wrap text in a div

    // 4. Save assistant response to DB
    const assistantMsgDb = await db.ChatMessage.create({
      userId: userId,
      sender: "assistant",
      content: finalResponseContent, // Save the potentially HTML formatted content
      imageUrl: imageInfoFound ? imageInfoFound.url : null, // Save original extracted URL *from response*
      isHtml: isHtmlResponse,
    });

    // 5. Send response back to client
    res.json({
      response: finalResponseContent, // Send the potentially HTML formatted content
      image_url: null, // Set to null as image is now embedded in 'response'
      is_html: isHtmlResponse,
      timestamp: assistantMsgDb.timestamp
    });

  } catch (error) {
    console.error("Chat processing error:", error);
    res.status(500).json({ error: "Erro interno ao processar mensagem." });
  }
});

// POST /clear_chat
router.post("/clear_chat", isAuthenticated, async (req, res) => {
  try {
    await db.ChatMessage.destroy({
      where: { userId: req.session.userId },
    });
    res.json({ success: true, message: "Histórico limpo com sucesso!" });
  } catch (error) {
    console.error(`Error clearing chat history for user ${req.session.userId}:`, error);
    res.status(500).json({ success: false, message: "Erro ao limpar histórico." });
  }
});

module.exports = router; // Export the router

