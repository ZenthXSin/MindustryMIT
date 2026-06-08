package com.mindustry.ide.tool.json

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class JsonBackendTest {

    @Test
    fun buildsBinaryTreeByOperatorPrecedence() {
        val tree = ArithmeticParser("1 + 2 * 3 - 4 / 2").parse()

        println("1 + 2 * 3 - 4 / 2 => ${tree.toTreeString()}")
        assertEquals("(- (+ 1 (* 2 3)) (/ 4 2))", tree.toTreeString())
    }

    @Test
    fun parenthesesOverrideOperatorPrecedence() {
        val tree = ArithmeticParser("(1 + 2) * (3 - 4) / 5").parse()

        println("(1 + 2) * (3 - 4) / 5 => ${tree.toTreeString()}")
        assertEquals("(/ (* (+ 1 2) (- 3 4)) 5)", tree.toTreeString())
    }

    @Test
    fun rejectsIncompleteExpression() {
        assertFailsWith<IllegalArgumentException> {
            ArithmeticParser("1 + * 2").parse()
        }
    }

    private sealed interface ExprNode {
        fun toTreeString(): String
    }

    private data class NumberNode(val value: String) : ExprNode {
        override fun toTreeString(): String = value
    }

    private data class BinaryNode(
        val operator: Char,
        val left: ExprNode,
        val right: ExprNode
    ) : ExprNode {
        override fun toTreeString(): String {
            return "($operator ${left.toTreeString()} ${right.toTreeString()})"
        }
    }

    private class ArithmeticParser(expression: String) {
        private val tokens = Lexer(expression).tokenize()
        private var index = 0

        fun parse(): ExprNode {
            val tree = parseExpression()
            if (current().type != TokenType.End) {
                error("Unexpected token '${current().text}'")
            }
            return tree
        }

        private fun parseExpression(): ExprNode {
            var node = parseTerm()
            while (current().text == "+" || current().text == "-") {
                val operator = consume().text.single()
                node = BinaryNode(operator, node, parseTerm())
            }
            return node
        }

        private fun parseTerm(): ExprNode {
            var node = parseFactor()
            while (current().text == "*" || current().text == "/") {
                val operator = consume().text.single()
                node = BinaryNode(operator, node, parseFactor())
            }
            return node
        }

        private fun parseFactor(): ExprNode {
            val token = current()
            return when (token.type) {
                TokenType.Number -> {
                    consume()
                    NumberNode(token.text)
                }
                TokenType.LeftParen -> {
                    consume()
                    val node = parseExpression()
                    expect(TokenType.RightParen)
                    node
                }
                else -> error("Expected number or '(' but got '${token.text}'")
            }
        }

        private fun expect(type: TokenType): Token {
            val token = current()
            if (token.type != type) {
                error("Expected $type but got '${token.text}'")
            }
            return consume()
        }

        private fun consume(): Token = tokens[index++]

        private fun current(): Token = tokens[index]

        private fun error(message: String): Nothing {
            throw IllegalArgumentException(message)
        }
    }

    private class Lexer(private val source: String) {
        private var index = 0

        fun tokenize(): List<Token> {
            val tokens = mutableListOf<Token>()
            while (index < source.length) {
                when (val char = source[index]) {
                    ' ', '\t', '\r', '\n' -> index += 1
                    '+', '-', '*', '/' -> {
                        tokens += Token(TokenType.Operator, char.toString())
                        index += 1
                    }
                    '(' -> {
                        tokens += Token(TokenType.LeftParen, char.toString())
                        index += 1
                    }
                    ')' -> {
                        tokens += Token(TokenType.RightParen, char.toString())
                        index += 1
                    }
                    in '0'..'9' -> tokens += readNumber()
                    else -> throw IllegalArgumentException("Unexpected char '$char'")
                }
            }
            tokens += Token(TokenType.End, "")
            return tokens
        }

        private fun readNumber(): Token {
            val start = index
            while (index < source.length && source[index].isDigit()) {
                index += 1
            }
            if (index < source.length && source[index] == '.') {
                index += 1
                while (index < source.length && source[index].isDigit()) {
                    index += 1
                }
            }
            return Token(TokenType.Number, source.substring(start, index))
        }
    }

    private data class Token(val type: TokenType, val text: String)

    private enum class TokenType {
        Number,
        Operator,
        LeftParen,
        RightParen,
        End
    }
}
