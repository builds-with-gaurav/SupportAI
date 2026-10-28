from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import (
    require_customer,
    require_agent,
    require_admin,
    get_current_active_user,
)
from models import User, Ticket, Message, AIAnalysis, AIResponse

from ml.predictor import analyze_ticket
from llm_service import generate_support_response


router = APIRouter(
    prefix="/tickets",
    tags=["Tickets"]
)


# =========================================================
# PYDANTIC SCHEMAS
# =========================================================


class TicketCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=5)
    priority: str = "MEDIUM"


class TicketUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    category: str | None = None
    assigned_agent_id: int | None = None


class MessageCreate(BaseModel):
    message: str = Field(..., min_length=1)


class AgentReview(BaseModel):
    status: str
    final_response: str | None = None


# =========================================================
# CONSTANTS
# =========================================================


VALID_STATUSES = {
    "OPEN",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_FOR_CUSTOMER",
    "ESCALATED",
    "RESOLVED",
    "CLOSED",
}

VALID_PRIORITIES = {
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
}


# =========================================================
# HELPER
# =========================================================


def ticket_to_dict(
    db: Session,
    ticket: Ticket
):
    """
    Converts a Ticket into the format required by the frontend.

    IMPORTANT:
    The customer's AI response is loaded from the AIResponse
    database table here.
    """

    ai_response = (
        db.query(AIResponse)
        .filter(AIResponse.ticket_id == ticket.id)
        .first()
    )

    ai_analysis = (
        db.query(AIAnalysis)
        .filter(AIAnalysis.ticket_id == ticket.id)
        .first()
    )

    return {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "category": ticket.category,
        "customer_id": ticket.customer_id,
        "assigned_agent_id": ticket.assigned_agent_id,
        "created_at": ticket.created_at,

        # AI Analysis
        "sentiment": (
            ai_analysis.sentiment
            if ai_analysis
            else None
        ),
        "intent": (
            ai_analysis.intent
            if ai_analysis
            else None
        ),

        # AI Response
        "ai_response": (
            ai_response.final_response
            if ai_response and ai_response.final_response
            else ai_response.draft_response
            if ai_response
            else None
        ),

        "ai_status": (
            ai_response.status
            if ai_response
            else None
        ),

        "ai_response_id": (
            ai_response.id
            if ai_response
            else None
        ),
    }


# =========================================================
# CREATE TICKET
# CUSTOMER ONLY
# =========================================================


@router.post("/")
def create_ticket(
    ticket_data: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer)
):
    # Validate priority
    priority = ticket_data.priority.upper()

    if priority not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid priority"
        )

    # ---------------------------------------------
    # Create ticket
    # ---------------------------------------------

    ticket = Ticket(
        title=ticket_data.title,
        description=ticket_data.description,
        priority=priority,
        status="OPEN",
        customer_id=current_user.id,
    )

    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    # ---------------------------------------------
    # ML ANALYSIS
    # ---------------------------------------------

    try:
        analysis = analyze_ticket(
            f"{ticket.title} {ticket.description}"
        )

        # Update ticket category
        ticket.category = analysis["category"]

        # Use ML priority
        predicted_priority = str(
            analysis["priority"]
        ).upper()

        if predicted_priority in VALID_PRIORITIES:
            ticket.priority = predicted_priority

        # Save AI analysis
        existing_analysis = (
            db.query(AIAnalysis)
            .filter(
                AIAnalysis.ticket_id == ticket.id
            )
            .first()
        )

        if existing_analysis:
            existing_analysis.category = analysis["category"]
            existing_analysis.priority = analysis["priority"]
            existing_analysis.sentiment = analysis["sentiment"]
            existing_analysis.intent = analysis["intent"]

        else:
            ai_analysis = AIAnalysis(
                ticket_id=ticket.id,
                category=analysis["category"],
                priority=analysis["priority"],
                sentiment=analysis["sentiment"],
                intent=analysis["intent"],
            )

            db.add(ai_analysis)

        db.commit()
        db.refresh(ticket)

    except Exception as error:
        print("ML analysis error:", error)

        # Ticket should still be created even if ML fails
        db.rollback()

        # Re-fetch ticket
        ticket = (
            db.query(Ticket)
            .filter(Ticket.id == ticket.id)
            .first()
        )

    return ticket_to_dict(db, ticket)


# =========================================================
# GET CUSTOMER'S TICKETS
# CUSTOMER ONLY
# =========================================================


@router.get("/my")
def get_my_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer)
):
    tickets = (
        db.query(Ticket)
        .filter(
            Ticket.customer_id == current_user.id
        )
        .order_by(Ticket.created_at.desc())
        .all()
    )

    return [
        ticket_to_dict(db, ticket)
        for ticket in tickets
    ]


# =========================================================
# GET AGENT DASHBOARD
# AGENT ONLY
#
# IMPORTANT:
# This route comes BEFORE /{ticket_id}
# =========================================================


@router.get("/agent/dashboard")
def agent_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    tickets = (
        db.query(Ticket)
        .filter(
            Ticket.assigned_agent_id
            == current_user.id
        )
        .order_by(Ticket.created_at.desc())
        .all()
    )

    dashboard = []

    for ticket in tickets:

        ai_response = (
            db.query(AIResponse)
            .filter(
                AIResponse.ticket_id
                == ticket.id
            )
            .first()
        )

        dashboard.append({
            "ticket_id": ticket.id,
            "title": ticket.title,
            "description": ticket.description,
            "status": ticket.status,
            "priority": ticket.priority,
            "category": ticket.category,
            "customer_id": ticket.customer_id,

            "ai_draft": (
                ai_response.draft_response
                if ai_response
                else None
            ),

            "ai_final_response": (
                ai_response.final_response
                if ai_response
                else None
            ),

            "ai_status": (
                ai_response.status
                if ai_response
                else None
            ),

            "ai_response_id": (
                ai_response.id
                if ai_response
                else None
            ),
        })

    return {
        "agent_id": current_user.id,
        "total_tickets": len(dashboard),
        "tickets": dashboard,
    }


# =========================================================
# GET ALL TICKETS
# ADMIN ONLY
# =========================================================


@router.get("/admin/all")
def get_all_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    tickets = (
        db.query(Ticket)
        .order_by(Ticket.created_at.desc())
        .all()
    )

    return [
        ticket_to_dict(db, ticket)
        for ticket in tickets
    ]


# =========================================================
# GET SINGLE TICKET
# CUSTOMER / AGENT / ADMIN
# =========================================================


@router.get("/{ticket_id}")
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    )
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # Customer can only see own ticket
    if current_user.role == "customer":
        if ticket.customer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    # Agent can only see assigned ticket
    elif current_user.role == "agent":
        if ticket.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    # Admin can see everything

    return ticket_to_dict(db, ticket)


# =========================================================
# UPDATE TICKET
# ADMIN ONLY
# =========================================================


@router.put("/{ticket_id}")
def update_ticket(
    ticket_id: int,
    ticket_data: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # ---------------------------------------------
    # STATUS
    # ---------------------------------------------

    if ticket_data.status is not None:

        new_status = ticket_data.status.upper()

        if new_status not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Invalid ticket status"
            )

        ticket.status = new_status

    # ---------------------------------------------
    # PRIORITY
    # ---------------------------------------------

    if ticket_data.priority is not None:

        new_priority = (
            ticket_data.priority.upper()
        )

        if new_priority not in VALID_PRIORITIES:
            raise HTTPException(
                status_code=400,
                detail="Invalid ticket priority"
            )

        ticket.priority = new_priority

    # ---------------------------------------------
    # CATEGORY
    # ---------------------------------------------

    if ticket_data.category is not None:
        ticket.category = ticket_data.category

    # ---------------------------------------------
    # ASSIGN AGENT
    # ---------------------------------------------

    if ticket_data.assigned_agent_id is not None:

        agent = (
            db.query(User)
            .filter(
                User.id
                == ticket_data.assigned_agent_id
            )
            .first()
        )

        if not agent:
            raise HTTPException(
                status_code=404,
                detail="Agent not found"
            )

        if agent.role != "agent":
            raise HTTPException(
                status_code=400,
                detail="Selected user is not an agent"
            )

        ticket.assigned_agent_id = agent.id

        # Automatically move OPEN → ASSIGNED
        if ticket.status == "OPEN":
            ticket.status = "ASSIGNED"

    db.commit()
    db.refresh(ticket)

    return ticket_to_dict(db, ticket)


# =========================================================
# ADD MESSAGE
# CUSTOMER / AGENT
# =========================================================


@router.post("/{ticket_id}/messages")
def add_message(
    ticket_id: int,
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    )
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # Customer can only message own ticket
    if current_user.role == "customer":

        if ticket.customer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    # Agent can only message assigned ticket
    elif current_user.role == "agent":

        if ticket.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    elif current_user.role == "admin":
        pass

    else:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    message = Message(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=message_data.message,
        sender_role=current_user.role,
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return {
        "id": message.id,
        "ticket_id": message.ticket_id,
        "sender_id": message.sender_id,
        "sender_role": message.sender_role,
        "message": message.message,
        "created_at": message.created_at,
    }


# =========================================================
# GET MESSAGES
# CUSTOMER / AGENT / ADMIN
# =========================================================


@router.get("/{ticket_id}/messages")
def get_messages(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    )
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # Access control
    if current_user.role == "customer":

        if ticket.customer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    elif current_user.role == "agent":

        if ticket.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    elif current_user.role == "admin":
        pass

    messages = (
        db.query(Message)
        .filter(
            Message.ticket_id == ticket_id
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    return messages


# =========================================================
# GET AI ANALYSIS
# =========================================================


@router.get("/{ticket_id}/ai-analysis")
def get_ai_analysis(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    )
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # Access control
    if current_user.role == "customer":

        if ticket.customer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    elif current_user.role == "agent":

        if ticket.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    elif current_user.role == "admin":
        pass

    analysis = (
        db.query(AIAnalysis)
        .filter(
            AIAnalysis.ticket_id == ticket_id
        )
        .first()
    )

    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="AI analysis not found"
        )

    return {
        "ticket_id": analysis.ticket_id,
        "category": analysis.category,
        "priority": analysis.priority,
        "sentiment": analysis.sentiment,
        "intent": analysis.intent,
        "created_at": analysis.created_at,
    }


# =========================================================
# GENERATE AI RESPONSE
# CUSTOMER / ASSIGNED AGENT
# =========================================================


@router.post("/{ticket_id}/ai-response")
def generate_ai_response(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    )
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # ---------------------------------------------
    # ACCESS CONTROL
    # ---------------------------------------------

    if current_user.role == "customer":

        if ticket.customer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    elif current_user.role == "agent":

        if ticket.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    else:
        raise HTTPException(
            status_code=403,
            detail="Only the customer or assigned agent can generate the AI response"
        )

    # ---------------------------------------------
    # GET AI ANALYSIS
    # ---------------------------------------------

    analysis = (
        db.query(AIAnalysis)
        .filter(
            AIAnalysis.ticket_id == ticket_id
        )
        .first()
    )

    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="AI analysis not found"
        )

    # ---------------------------------------------
    # GENERATE RESPONSE USING GROQ
    # ---------------------------------------------

    try:

        generated_response = generate_support_response(
            title=ticket.title,
            description=ticket.description,
            category=analysis.category,
            priority=analysis.priority,
            sentiment=analysis.sentiment,
            intent=analysis.intent,
        )

    except Exception as error:

        print(
            "AI response generation error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=f"AI response generation failed: {str(error)}"
        )

    if not generated_response:
        raise HTTPException(
            status_code=500,
            detail="AI returned an empty response"
        )

    # ---------------------------------------------
    # SAVE / UPDATE AI RESPONSE
    # ---------------------------------------------

    ai_response = (
        db.query(AIResponse)
        .filter(
            AIResponse.ticket_id == ticket_id
        )
        .first()
    )

    if ai_response:

        ai_response.draft_response = (
            generated_response
        )

        ai_response.final_response = None
        ai_response.status = "DRAFT"
        ai_response.reviewed_by = None

    else:

        ai_response = AIResponse(
            ticket_id=ticket_id,
            draft_response=generated_response,
            final_response=None,
            status="DRAFT",
            reviewed_by=None,
        )

        db.add(ai_response)

    db.commit()
    db.refresh(ai_response)

    return {
        "response_id": ai_response.id,
        "ticket_id": ticket_id,
        "draft_response": ai_response.draft_response,
        "final_response": ai_response.final_response,
        "status": ai_response.status,
    }


# =========================================================
# AGENT REVIEW AI RESPONSE
# =========================================================


@router.put("/{ticket_id}/ai-review")
def review_ai_response(
    ticket_id: int,
    review: AgentReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found"
        )

    # Agent must be assigned to ticket
    if ticket.assigned_agent_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to this ticket"
        )

    ai_response = (
        db.query(AIResponse)
        .filter(
            AIResponse.ticket_id == ticket_id
        )
        .first()
    )

    if not ai_response:
        raise HTTPException(
            status_code=404,
            detail="AI response not found"
        )

    review_status = review.status.upper()

    allowed_statuses = {
        "APPROVED",
        "EDITED",
        "ESCALATED",
    }

    if review_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid review status"
        )

    # ---------------------------------------------
    # APPROVE
    # ---------------------------------------------

    if review_status == "APPROVED":

        ai_response.final_response = (
            ai_response.draft_response
        )

        ai_response.status = "APPROVED"

        # Ticket moves forward
        ticket.status = "RESOLVED"

    # ---------------------------------------------
    # EDIT
    # ---------------------------------------------

    elif review_status == "EDITED":

        if not review.final_response:
            raise HTTPException(
                status_code=400,
                detail="final_response is required when editing"
            )

        ai_response.final_response = (
            review.final_response
        )

        ai_response.status = "EDITED"

        ticket.status = "RESOLVED"

    # ---------------------------------------------
    # ESCALATE
    # ---------------------------------------------

    elif review_status == "ESCALATED":

        ai_response.status = "ESCALATED"

        ticket.status = "ESCALATED"

        if review.final_response:
            ai_response.final_response = (
                review.final_response
            )

    ai_response.reviewed_by = current_user.id

    db.commit()
    db.refresh(ai_response)
    db.refresh(ticket)

    return {
        "ticket_id": ticket.id,
        "response_id": ai_response.id,
        "status": ai_response.status,
        "final_response": ai_response.final_response,
        "ticket_status": ticket.status,
        "reviewed_by": current_user.id,
    }