CREATE TABLE "UsuarioPerfilAdicional" (
 "usuarioId" text NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
 "perfilId" text NOT NULL REFERENCES "ConfiguracaoPerfil"("id") ON DELETE RESTRICT,
 PRIMARY KEY ("usuarioId","perfilId")
);
