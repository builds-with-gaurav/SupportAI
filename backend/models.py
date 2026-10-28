from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(100), nullable=False)

    email = Column(
        String(150),
        unique=True,
        index=True,
        nullable=False
    )

    password = Column(String(255), nullable=False)

    role = Column(
        String(20),
        default="customer",
        nullable=False
    )

    is_active = Column(
        Boolean,
        default=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(
        String(200),
        nullable=False
    )

    description = Column(
        Text,
        nullable=False
    )

    status = Column(
        String(50),
        default="OPEN",
        nullable=False
    )

    priority = Column(
        String(20),
        default="MEDIUM",
        nullable=False
    )

    category = Column(
        String(100),
        nullable=True
    )

    customer_id = Column(
        Integer,
        nullable=False
    )

    assigned_agent_id = Column(
        Integer,
        nullable=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

class Message(Base):
    __tablename__ = "messages"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    ticket_id = Column(
        Integer,
        nullable=False,
        index=True
    )

    sender_id = Column(
        Integer,
        nullable=False
    )

    message = Column(
        Text,
        nullable=False
    )

    sender_role = Column(
        String(20),
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

class AIAnalysis(Base):
    __tablename__ = "ai_analysis"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    ticket_id = Column(
        Integer,
        nullable=False,
        unique=True,
        index=True
    )

    category = Column(
        String(100),
        nullable=False
    )

    priority = Column(
        String(20),
        nullable=False
    )

    sentiment = Column(
        String(50),
        nullable=False
    )

    intent = Column(
        String(100),
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    
class AIResponse(Base):
    __tablename__ = "ai_responses"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, nullable=False, unique=True, index=True)

    draft_response = Column(Text, nullable=False)
    final_response = Column(Text, nullable=True)

    status = Column(String(30), default="DRAFT", nullable=False)
    reviewed_by = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        onupdate=func.now()
    )