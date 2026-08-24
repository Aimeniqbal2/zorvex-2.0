import logging
from decimal import Decimal
import ast
import operator

logger = logging.getLogger(__name__)

class FormulaEngineError(Exception):
    pass

def _safe_eval(node, context):
    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
    }
    
    if isinstance(node, ast.Num):
        return Decimal(str(node.n))
    elif isinstance(node, ast.Constant):
        return Decimal(str(node.value))
    elif isinstance(node, ast.Name):
        if node.id in context:
            return Decimal(str(context[node.id]))
        raise FormulaEngineError(f"Undefined variable in formula: {node.id}")
    elif isinstance(node, ast.BinOp):
        left = _safe_eval(node.left, context)
        right = _safe_eval(node.right, context)
        op = type(node.op)
        if op not in operators:
            raise FormulaEngineError(f"Unsupported operator in formula: {op}")
        if op == ast.Div and right == Decimal('0'):
            raise FormulaEngineError("Division by zero in formula.")
        return operators[op](left, right)
    elif isinstance(node, ast.UnaryOp):
        operand = _safe_eval(node.operand, context)
        if isinstance(node.op, ast.USub):
            return -operand
        elif isinstance(node.op, ast.UAdd):
            return operand
        raise FormulaEngineError(f"Unsupported unary operator in formula: {type(node.op)}")
    elif isinstance(node, ast.Expression):
        return _safe_eval(node.body, context)
    else:
        raise FormulaEngineError(f"Unsupported expression type: {type(node)}")

def evaluate(formula_str, context):
    """
    Evaluates a simple math formula with variables provided in the context dictionary.
    """
    if not formula_str:
        return Decimal('0.00')
        
    try:
        tree = ast.parse(formula_str, mode='eval')
        result = _safe_eval(tree, context)
        return result
    except SyntaxError as e:
        raise FormulaEngineError(f"Syntax error in formula: {str(e)}")
    except Exception as e:
        raise FormulaEngineError(f"Error evaluating formula: {str(e)}")
