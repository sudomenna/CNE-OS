CREATE TABLE "brand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"primary_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_brand_slug_kebab" CHECK ("brand"."slug" ~ '^[a-z0-9][a-z0-9-]*$')
);
--> statement-breakpoint
CREATE TABLE "brand_legal_entity" (
	"brand_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_legal_entity_brand_id_legal_entity_id_pk" PRIMARY KEY("brand_id","legal_entity_id")
);
--> statement-breakpoint
CREATE TABLE "legal_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"company_name" text NOT NULL,
	"trade_name" text,
	"tax_regime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_legal_entity_cnpj_length" CHECK (char_length("legal_entity"."cnpj") = 14 AND "legal_entity"."cnpj" ~ '^[0-9]{14}$')
);
--> statement-breakpoint
ALTER TABLE "brand_legal_entity" ADD CONSTRAINT "brand_legal_entity_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "brand_legal_entity" ADD CONSTRAINT "brand_legal_entity_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brand_name" ON "brand" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brand_slug" ON "brand" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brand_legal_entity_default" ON "brand_legal_entity" USING btree ("brand_id") WHERE "brand_legal_entity"."is_default" = true;--> statement-breakpoint
CREATE INDEX "idx_brand_legal_entity_legal_entity_id" ON "brand_legal_entity" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_legal_entity_cnpj" ON "legal_entity" USING btree ("cnpj");