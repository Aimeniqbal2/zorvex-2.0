from typing import List

class Capability:
    def __init__(self, code: str, label: str, engine: str, description: str = ""):
        self.code = code
        self.label = label
        self.engine = engine  # the underlying universal module code
        self.description = description

class IndustryPackage:
    """Base class for all industry-specific ERP configurations."""
    code: str = ""
    name: str = ""
    version: str = "1.0"
    
    # List of Capabilities
    capabilities: List[Capability] = []
    
    def get_capabilities(self) -> List[Capability]:
        return self.capabilities
