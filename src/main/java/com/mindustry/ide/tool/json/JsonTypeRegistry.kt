package com.mindustry.ide.tool.json

/**
 * 字段类型的支持解析模式
 * 对应 Mindustry ContentParser.classParsers 中各 FieldParser 的行为
 */
enum class ParseMode {
    /** 字符串引用，如 "basicBullet"、"explosion"，从指定静态类查值 */
    STRING_REF,
    /** 内联对象，如 { "type": "BasicBulletType", ... } */
    INLINE_OBJECT,
    /** 数组，如 MultiEffect / MultiBulletType / DrawMulti / RandomSound */
    ARRAY,
    /** 原始值，如 Color 的十六进制字符串 "ff0000ff" */
    PRIMITIVE,
    /** 数字索引，如 Team.get(index)、PowerAmmoType(number) */
    NUMERIC,
}

/**
 * 单个字段类型的解析元信息
 *
 * @param modes          该类型支持的解析模式列表
 * @param stringSource   STRING_REF 模式下，可用字符串值来自哪个静态类（简单类名）
 * @param defaultType    INLINE_OBJECT 模式下，缺省的 "type" 字段值（简单类名）
 */
data class TypeParserMeta(
    val modes: List<ParseMode>,
    val stringSource: String = "",
    val defaultType: String = ""
)

/**
 * Mindustry ContentParser.classParsers 在 MindustryMIT 侧的对应注册表
 * 只注册需要特殊处理的类型，普通类型走默认对象展开逻辑
 */
object JsonTypeRegistry {

    val parsers: Map<String, TypeParserMeta> = mapOf(

        // ── 效果 / 视觉 ─────────────────────────────────────────────────────────
        "Effect" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT, ParseMode.ARRAY),
            stringSource = "Fx"
        ),
        "DrawBlock" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT, ParseMode.ARRAY),
            defaultType = "DrawDefault"
        ),
        "DrawPart" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT),
            defaultType = "RegionPart"
        ),
        "PartProgress" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT)
        ),
        "TextureRegion" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "Icons"
        ),
        "Color" to TypeParserMeta(
            modes = listOf(ParseMode.PRIMITIVE)
        ),
        "Blending" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "Blending"
        ),
        "CacheLayer" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "CacheLayer"
        ),

        // ── 弹药 / 武器 ──────────────────────────────────────────────────────────
        "BulletType" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT, ParseMode.ARRAY),
            stringSource = "Bullets",
            defaultType = "BasicBulletType"
        ),
        "AmmoType" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT, ParseMode.NUMERIC),
            stringSource = "Items"
        ),
        "Weapon" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT),
            defaultType = "Weapon"
        ),
        "MassDriverBolt" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT),
            defaultType = "MassDriverBolt"
        ),
        "ShootPattern" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT),
            defaultType = "ShootPattern"
        ),

        // ── 消耗 / 能力 ──────────────────────────────────────────────────────────
        "Consume" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT)
        ),
        "ConsumeLiquidBase" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT)
        ),
        "Ability" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT)
        ),

        // ── 内容引用 ─────────────────────────────────────────────────────────────
        "StatusEffect" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT),
            stringSource = "StatusEffects"
        ),
        "Sound" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.ARRAY),
            stringSource = "Sounds"
        ),
        "Music" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "Musics"
        ),
        "Schematic" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "Loadouts"
        ),

        // ── 单位行为 ─────────────────────────────────────────────────────────────
        "UnitCommand" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "UnitCommand"
        ),
        "UnitStance" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "UnitStance"
        ),

        // ── 数学 / 插值 ──────────────────────────────────────────────────────────
        "Interp" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "Interp"
        ),
        "Sortf" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "UnitSorts"
        ),
        "Vec3" to TypeParserMeta(
            modes = listOf(ParseMode.ARRAY, ParseMode.INLINE_OBJECT)
        ),
        "Mat3D" to TypeParserMeta(
            modes = listOf(ParseMode.ARRAY, ParseMode.INLINE_OBJECT)
        ),

        // ── 属性 ─────────────────────────────────────────────────────────────────
        "Attribute" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF)
        ),
        "Attributes" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT)
        ),

        // ── 其他 ─────────────────────────────────────────────────────────────────
        "Team" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.NUMERIC),
            stringSource = "Team"
        ),
        "BuildVisibility" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF),
            stringSource = "BuildVisibility"
        ),
        "PlanetGenerator" to TypeParserMeta(
            modes = listOf(ParseMode.INLINE_OBJECT),
            defaultType = "AsteroidGenerator"
        ),
        "Objectives.Objective" to TypeParserMeta(
            modes = listOf(ParseMode.STRING_REF, ParseMode.INLINE_OBJECT),
            defaultType = "SectorComplete"
        ),
    )

    /** 按简单类名或全限定名查询；找不到返回 null（前端走默认对象展开） */
    fun get(typeName: String): TypeParserMeta? {
        if (typeName.isBlank()) return null
        return parsers[typeName]
            ?: parsers[typeName.substringAfterLast('.').substringAfterLast('$')]
    }
}
